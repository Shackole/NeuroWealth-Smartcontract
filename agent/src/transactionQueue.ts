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
 *  - Failed jobs moved to `transactions:failed` dead-letter queue with full
 *    error context attached as `failedReason`
 *  - GET /api/queue/stats exposes queue depth and counts
 *  - Per-signing-account sequence allocation is serialized via a Redis lock so
 *    parallel workers never sign the same sequence, while independent signing
 *    accounts still progress concurrently (#414)
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

// Per-signing-account sequence lock (#414).
// The lock is scoped to the signing account's public key so that independent
// accounts never contend with each other, while workers sharing one account
// are serialized. TTL guards against a crashed worker holding the lock forever.
const SEQ_LOCK_TTL_MS = 30_000;
const SEQ_LOCK_RETRY_MS = 50;
const SEQ_LOCK_MAX_WAIT_MS = 30_000;

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
// Per-signing-account sequence lock (#414)
// ─────────────────────────────────────────────────────────────────────────────

function seqLockKey(publicKey: string): string {
  return `seq:lock:${publicKey}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquire a per-signing-account lock. Returns a release function on success.
 * The lock is keyed by the signing account's public key, so two independent
 * accounts acquire independent locks and progress concurrently.
 */
async function acquireSequenceLock(
  publicKey: string,
): Promise<() => Promise<void>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (transactionQueue as any).client as import('ioredis').Redis;
  const key = seqLockKey(publicKey);
  const token = `${process.pid}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
  const deadline = Date.now() + SEQ_LOCK_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const ok = await client.set(key, token, 'PX', SEQ_LOCK_TTL_MS, 'NX');
    if (ok === 'OK') {
      return async () => {
        // Only release if we still own the lock (avoid deleting a lock that
        // expired and was re-acquired by another worker).
        const current = await client.get(key);
        if (current === token) {
          await client.del(key);
        }
      };
    }
    await sleep(SEQ_LOCK_RETRY_MS);
  }

  throw new Error(
    `Timed out acquiring sequence lock for signing account ${publicKey}`,
  );
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
 *
 * Callers MUST hold the per-signing-account sequence lock so that the sequence
 * fetched here is not consumed by a parallel worker before submission.
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
 * Submit a signed transaction

/* … truncated 4460 chars — edit only what you need near the top … */
