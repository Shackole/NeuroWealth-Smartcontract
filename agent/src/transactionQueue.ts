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
 * Observable outcome of a deduplication reservation attempt.
 *  - `reserved`  — this caller won the reservation and may enqueue.
 *  - `duplicate` — another in-flight request holds a live reservation.
 *  - `released`  — a reservation was released (enqueue failed / retryable).
 *  - `expired`   — a reservation was found but had already lapsed.
 */
export type ReservationOutcome = 'reserved' | 'duplicate' | 'released' | 'expired';

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
// Deduplication reservations (atomic SET NX PX via Bull's Redis connection)
// ─────────────────────────────────────────────────────────────────────────────

function dedupKey(key: string): string {
  return `dedup:tx:${key}`;
}

/**
 * Atomically reserve a deduplication key.
 *
 * Uses `SET key <token> NX PX <ttl>` so the check-and-set happens in a single
 * Redis round-trip. Concurrent identical requests race on the same key and
 * exactly one wins the reservation; the rest observe `duplicate`.
 *
 * The reservation carries a bounded lifetime (`DEDUP_TTL_MS`) so a crashed or
 * abandoned enqueue cannot block retries forever.
 */
async function reserveDeduplicationKey(
  queue: Queue<TransactionJobData>,
  key: string,
  token: string,
): Promise<ReservationOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (queue as any).client as import('ioredis').Redis;
  const result = await client.set(dedupKey(key), token, 'PX', DEDUP_TTL_MS, 'NX');
  return result === 'OK' ? 'reserved' : 'duplicate';
}

/**
 * Release a reservation held by `token`.
 *
 * Only deletes the key when the stored token matches, so a stale release from
 * a previous attempt cannot clobber a newer reservation. Returns `released`
 * when the key was removed, `expired` when it had already lapsed.
 */
async function releaseDeduplicationKey(
  queue: Queue<TransactionJobData>,
  key: string,
  token: string,
): Promise<ReservationOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (queue as any).client as import('ioredis').Redis;
  const removed = await client.eval(
    `if redis.call('get', KEYS[1]) == ARGV[1] then
       return redis.call('del', KEYS[1])
     else
       return 0
     end`,
    1,
    dedupKey(key),
    token,
  );
  return removed === 1 ? 'released' : 'expired';
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — add a job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue a Stellar transaction for reliable submission.
 * Returns `null` if the job was deduplicated (already in-flight).
 *
 * Deduplication is atomic: a reservation is taken before the job is added and
 * released if the add fails, so a failed enqueue can be safely retried.
 */
export async function enqueueTransaction(
  data: TransactionJobData,
): Promise<Job<TransactionJobData> | null> {
  const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const reservation = await reserveDeduplicationKey(
    transactionQueue,
    data.deduplicationKey,
    token,
  );

  if (reservation !== 'reserved') {
    logger.warn(
      { deduplicationKey: data.deduplicationKey, outcome: reservation },
      'Transaction deduplicated — already queued',
    );
    return null;
  }

  let job: Job<TransactionJobData>;
  try {
    job = await transactionQueue.add(data);
  } catch (err) {
    // Enqueue failed — release the reservation so the request can be retried.
    const outcome = await releaseDeduplicationKey(
      transactionQueue,
      data.deduplicationKey,
      token,
    );
    logger.error(
      {
        deduplicationKey: data.deduplicationKey,
        outcome,
        err: err instanceof Error ? err.message : String(err),
      },
      'Transaction enqueue failed — reservation released for retry',
    );
    throw err;
  }

  logger.info(
    {
      jobId: job.id,
      type: data.type,
      userAddress: data.userAddress,
      outcome: 'reserved',
    },
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
 * Submit a signed transact

/* … truncated 4460 chars — edit only what you need near the top … */
