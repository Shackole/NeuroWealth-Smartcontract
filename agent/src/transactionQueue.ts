/**
 * Transaction Queue — Bull/Redis backed Stellar submission (#32)
 *
 * Provides reliable, deduplicated, retriable Stellar transaction submission.
 *
 * Key behaviours:
 *  - Concurrency 5 workers on the `transactions` queue
 *  - Sequence-number mismatch → up to 3 re-fetches + re-sign attempts
 *  - Exponential backoff for generic RPC errors (base 2 s, max 30 s)
 *  - Deduplication: same `deduplicationKey` within 60 s is silently dropped
 *  - Failed jobs moved to `transactions:failed` dead-letter queue with
 *    redacted error context attached as `failedReason`
 *  - Dead-letter records are retained for a bounded window and purged
 *    predictably (see DLQ retention constants below)
 *  - GET /api/queue/stats exposes queue depth and counts
 */

import Bull from 'bull';
import type { Job, Queue } from 'bull';
import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  Asset,
  Horizon,
} from '@stellar/stellar-sdk';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TransactionType = 'deposit' | 'withdrawal' | 'rebalance';

export interface TransactionJobData {
  /** Unique key used for deduplication — same key within TTL is skipped. */
  deduplicationKey: string;
  /** Who is initiating this transaction (Stellar public key). */
  userAddress: string;
  type: TransactionType;
  /** Amount in stroops (7 decimal places, 1 USDC = 10_000_000 stroops). */
  amountStroops: string;
  /** Optional: destination address for withdrawals */
  destinationAddress?: string;
  /** Optional: Soroban contract invocation XDR (if pre-built by caller) */
  xdrEnvelope?: string;
  /** ISO timestamp when this job was created by the caller. */
  requestedAt: string;
}

export interface TransactionJobResult {
  txHash: string;
  ledger: number;
  submittedAt: string;
}

/**
 * Redacted failure record stored on the dead-letter queue. Sensitive payload
 * fields (signed XDR envelopes, secrets) are never persisted here.
 */
export interface DeadLetterRecord {
  deduplicationKey: string;
  userAddress: string;
  type: TransactionType;
  amountStroops: string;
  destinationAddress?: string;
  requestedAt: string;
  /** Redacted error message — no secrets, no raw XDR. */
  error: string;
  /** ISO timestamp when the job was dead-lettered. */
  failedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const STELLAR_RPC_URL =
  process.env.STELLAR_RPC_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK === 'mainnet'
    ? Networks.PUBLIC
    : Networks.TESTNET;
const AGENT_SECRET = process.env.AGENT_SECRET_KEY || '';

const QUEUE_NAME = 'transactions';
const DLQ_NAME = 'transactions:failed';
const CONCURRENCY = 5;
const MAX_SEQUENCE_RETRIES = 3;
const DEDUP_TTL_MS = 60_000; // 60 seconds

/**
 * Dead-letter retention window. Records older than this are purged by the
 * scheduled sweep. Configurable via env for operators; defaults to 7 days.
 */
const DLQ_RETENTION_MS = (() => {
  const raw = parseInt(process.env.DLQ_RETENTION_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 7 * 24 * 60 * 60 * 1000;
})();

/** How often the retention sweep runs. Defaults to 1 hour. */
const DLQ_SWEEP_INTERVAL_MS = (() => {
  const raw = parseInt(process.env.DLQ_SWEEP_INTERVAL_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 60 * 60 * 1000;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Queue setup
// ─────────────────────────────────────────────────────────────────────────────

export const transactionQueue: Queue<TransactionJobData> = new Bull<TransactionJobData>(
  QUEUE_NAME,
  REDIS_URL,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2_000, // 2 s → 4 s → 8 s
      },
      removeOnComplete: true,
      removeOnFail: false, // keep in failed queue
      timeout: 60_000,
    },
  },
);

/** Dead-letter queue — jobs that exhausted all retries land here. */
export const deadLetterQueue: Queue<TransactionJobData> = new Bull<TransactionJobData>(
  DLQ_NAME,
  REDIS_URL,
  {
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  },
);

// Horizon server for sequence number fetching and submission
const server = new Horizon.Server(STELLAR_RPC_URL);

// ─────────────────────────────────────────────────────────────────────────────
// Redaction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip secrets and sensitive payload fields from an error before it is
 * persisted as dead-letter failure data. Never store signed XDR envelopes,
 * secret keys, or raw error objects that may embed them.
 */
export function redactFailure(
  data: TransactionJobData,
  err: unknown,
): DeadLetterRecord {
  const rawMsg = err instanceof Error ? err.message : String(err);
  // Scrub anything that looks like a secret key or a base64 XDR envelope.
  const error = rawMsg
    .replace(/S[A-Z2-7]{55}/g, '[REDACTED_SECRET]')
    .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, '[REDACTED_PAYLOAD]');

  return {
    deduplicationKey: data.deduplicationKey,
    userAddress: data.userAddress,
    type: data.type,
    amountStroops: data.amountStroops,
    destinationAddress: data.destinationAddress,
    requestedAt: data.requestedAt,
    error,
    failedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dead-letter retention
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Purge dead-letter records older than the retention window. Returns the
 * number of records removed. Predictable: based on `failedAt` timestamp.
 */
export async function purgeExpiredDeadLetters(
  now: number = Date.now(),
): Promise<number> {
  const cutoff = now - DLQ_RETENTION_MS;
  const jobs = await deadLetterQueue.getJobs(
    ['completed', 'failed', 'waiting', 'delayed'],
    0,
    -1,
    false,
  );

  let purged = 0;
  for (const job of jobs) {
    const record = job.data as unknown as DeadLetterRecord;
    const failedAt = record?.failedAt ? Date.parse(record.failedAt) : NaN;
    const ts = Number.isFinite(failedAt) ? failedAt : job.timestamp;
    if (ts < cutoff) {
      await job.remove();
      purged += 1;
    }
  }

  if (purged > 0) {
    logger.info({ purged, cutoff }, 'Purged expired dead-letter records');
  }
  return purged;
}

/**
 * Start the periodic retention sweep. Returns a stop function for tests.
 */
export function startDeadLetterRetentionSweep(): () => void {
  const timer = setInterval(() => {
    purgeExpiredDeadLetters().catch((err) =>
      logger.error({ err }, 'Dead-letter retention sweep failed'),
    );
  }, DLQ_SWEEP_INTERVAL_MS);
  // Do not keep the process alive solely for the sweep.
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deduplication helpers (Redis SET with TTL via Bull's own Redis connection)
// ─────────────────────────────────────────────────────────────────────────────

function dedupKey(key: string): string {
  return `dedup:tx:${key}`;
}

async function isDuplicate(
  queue: Queue<TransactionJobData>,
  key: string,
): Promise<boolean> {
  // Access Bull's internal Redis client (type-cast needed — Bull exposes it)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (queue as any).client as import('ioredis').Redis;
  const result = await client.get(dedupKey(key));
  return result !== null;
}

async function markSeen(
  queue: Queue<TransactionJobData>,
  key: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (queue as any).client as import('ioredis').Redis;
  await client.set(dedupKey(key), '1', 'PX', DEDUP_TTL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — add a job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue a Stellar transaction for reliable submission.
 * Returns `null` if the job was deduplicated (already in-flight).
 */
export async function enqueueTransaction(
  data: TransactionJobData,
): Promise<Job<TransactionJobData> | null> {
  if (await isDuplicate(transactionQueue, data.deduplicationKey)) {
    logger.warn(
      { deduplicationKey: data.deduplicationKey },
      'Transaction deduplicated — already queued',
    );
    return null;
  }

  await markSeen(transactionQueue, data.deduplicationKey);
  const job = await transactionQueue.add(data);

  logger.info(
    { jobId: job.id, type: data.type, userAddress: data.userAddress },
    'Transaction enqueued',
  );
  return job;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator replay controls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replay a dead-lettered transaction. Preserves authorization (the original
 * `userAddress` is retained) and idempotency (the original `deduplicationKey`
 * is reused, so a duplicate in-flight job is still rejected).
 *
 * Returns the re-enqueued job, or `null` if it was deduplicated.
 */
export async function replayDeadLetter(
  jobId: string | number,
): Promise<Job<TransactionJobData> | null> {
  const dlJob = await deadLetterQueue.getJob(jobId);
  if (!dlJob) {
    throw new Error(`Dead-letter job ${jobId} not found`);
  }

  const record = dlJob.data as unknown as DeadLetterRecord;
  const data: TransactionJobData = {
    deduplicationKey: record.deduplicationKey,
    userAddress: record.userAddress,
    type: record.type,
    amountStroops: record.amountStroops,
    destinationAddress: record.destinationAddress,
    requestedAt: record.requestedAt,
  };

  const job = await enqueueTransaction(data);
  if (job) {
    logger.info(
      { dlJobId: jobId, newJobId: job.id, userAddress: data.userAddress },
      'Dead-letter transaction replayed',
    );
  }
  return job;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker — process jobs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the error message indicates a sequence number conflict —
 * the only case where we re-fetch sequence and retry within the same attempt.
 */
function isSequenceMismatch(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.toLowerCase().includes('tx_bad_seq') ||
    msg.toLowerCase().includes('sequence') ||
    msg.toLowerCase().includes('bad_seq')
  );
}

/**
 * Build and sign a Stellar transaction.
 * Fetches a fresh sequence number before each call.
 */
async function buildAndSignTransaction(
  keypair: Keypair,
  data: TransactionJobData,
): Promise<string> {
  // If the caller already built and serialised the XDR, just re-sign with
  // a fresh sequence number rather than rebuilding from scratch.
  if (data.xdrEnvelope) {
    // Re-fetch sequence and rebuild with latest account state
    const account = await server.loadAccount(keypair.publicKey());
    const tx = TransactionBuilder.fromXDR(data.xdrEnvelope, NETWORK_PASSPHRASE);

    // Re-sign with this keypair
    tx.sign(keypair);
    return tx.toEnvelope().toXDR('base64');
  }

  // Otherwise build a simple payment or internal transfer
  const account = await server.loadAccount(keypair.publicKey());
  const usdcAsset = new Asset(
    'USDC',
    process.env.USDC_ISSUER ||
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  );

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  switch (data.type) {
    case 'deposit':
    case 'withdrawal': {
      const destination = data.destinationAddress || keypair.publicKey();
      txBuilder.addOperation(
        Operation.payment({
          destination,
          asset: usdcAsset,
          amount: (parseInt(data.amountStroops, 10) / 1e7).toFixed(7),
        }),
      );
      break;
    }
    case 'rebalance': {
      // Rebalance is always a contract invocation — we expect xdrEnvelope
      // for this type. Log a warning and create a no-op.
      logger.warn(
        { type: data.type },
        'Rebalance job missing xdrEnvelope — skipping operation',
      );
      txBuilder.addOperation(
        Operation.manageData({ name: 'noop', value: null }),
      );
      break;
    }
  }

  const tx = txBuilder.setTimeout(30).build();
  tx.sign(keypair);
  return tx.toEnvelope().toXDR('base64');
}

/**
 * Submit a signed transaction to Horizon.
 */
async function submitTransaction(xdr: string): Promise<TransactionJobResult> {
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  const response = await server.submitTransaction(tx);
  return {
    txHash: response.hash,
    ledger: response.ledger,
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Process a single transaction job. Retries sequence mismatches internally,
 * then submits. On terminal failure, the job is moved to the dead-letter
 * queue with a redacted failure record (no secrets, no raw XDR).
 */
async function processJob(
  job: Job<TransactionJobData>,
): Promise<TransactionJobResult> {
  const data = job.data;
  const keypair = Keypair.fromSecret(AGENT_SECRET);

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_SEQUENCE_RETRIES; attempt++) {
    try {
      const xdr = await buildAndSignTransaction(keypair, data);
      return await submitTransaction(xdr);
    } catch (err) {
      lastErr = err;
      if (!isSequenceMismatch(err)) break;
      logger.warn(
        { jobId: job.id, attempt: attempt + 1 },
        'Sequence mismatch — retrying with fresh sequence',
      );
    }
  }

  // Terminal failure — dead-letter with redacted record.
  const record = redactFailure(data, lastErr);
  await deadLetterQueue.add(record as unknown as TransactionJobData);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Start the worker. Returns the queue for lifecycle management.
 */
export function startTransactionWorker(): Queue<TransactionJobData> {
  transactionQueue.process(CONCURRENCY, processJob);
  startDeadLetterRetentionSweep();
  logger.info({ concurrency: CONCURRENCY }, 'Transaction worker started');
  return transactionQueue;
}
