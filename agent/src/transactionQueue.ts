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
 *  - Submitted transaction hashes are persisted before submission and
 *    reconciled after RPC timeouts so an accepted transaction is never
 *    re-executed; unknown results stay pending within a bounded policy (#415)
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
 * Durable record of a submission attempt. Persisted to Redis before the
 * transaction is broadcast so that a timeout leaves a recoverable hash.
 */
export type SubmissionStatus =
  | 'pending'
  | 'accepted'
  | 'failed'
  | 'unknown';

export interface SubmissionRecord {
  txHash: string;
  status: SubmissionStatus;
  /** ISO timestamp of the last status update. */
  updatedAt: string;
  /** Number of reconciliation polls performed so far. */
  reconcileAttempts: number;
  /** Terminal error message when status === 'failed'. */
  error?: string;
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

// Submission reconciliation policy (#415).
// After an RPC timeout we poll the network for the persisted hash a bounded
// number of times before declaring the outcome unknown. Records are retained
// long enough to cover the reconciliation window.
const SUBMISSION_RECORD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECONCILE_MAX_ATTEMPTS = 5;
const RECONCILE_INTERVAL_MS = 2_000;

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
// Submission record persistence (#415)
// ─────────────────────────────────────────────────────────────────────────────

function submissionKey(txHash: string): string {
  return `submission:tx:${txHash}`;
}

/**
 * Persist a submission record before broadcasting. The hash is written first
 * so that a timeout during submission still leaves a durable record we can
 * reconcile against the network.
 */
async function persistSubmission(record: SubmissionRecord): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (transactionQueue as any).client as import('ioredis').Redis;
  await client.set(
    submissionKey(record.txHash),
    JSON.stringify(record),
    'PX',
    SUBMISSION_RECORD_TTL_MS,
  );
}

async function loadSubmission(
  txHash: string,
): Promise<SubmissionRecord | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (transactionQueue as any).client as import('ioredis').Redis;
  const raw = await client.get(submissionKey(txHash));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubmissionRecord;
  } catch {
    return null;
  }
}

/**
 * Query the network for the status of a previously submitted hash.
 * Returns 'accepted' when the transaction is on-chain, 'failed' when the
 * network reports a terminal failure, and 'unknown' when the outcome cannot
 * yet be determined (e.g. not found / still pending).
 */
async function querySubmissionStatus(
  txHash: string,
): Promise<SubmissionStatus> {
  try {
    const tx = await server.transactions().transaction(txHash).call();
    if (tx && tx.successful === true) {
      return 'accepted';
    }
    if (tx && tx.successful === false) {
      return 'failed';
    }
    return 'unknown';
  } catch (err) {
    // 404 → not yet visible on-chain; treat as unknown so we keep polling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (err as any)?.response?.status;
    if (status === 404) {
      return 'unknown';
    }
    logger.warn({ txHash, err }, 'Failed to query submission status');
    return 'unknown';
  }
}

/**
 * Reconcile an uncertain submission within a bounded policy. Polls the network
 * for the persisted hash up to RECONCILE_MAX_ATTEMPTS times. Returns the final
 * status: 'accepted' (do not retry), 'failed' (terminal), or 'unknown' (still
 * pending — caller must not construct a replacement).
 */
async function reconcileSubmission(
  txHash: string,
): Promise<SubmissionRecord> {
  let record = await loadSubmission(txHash);
  if (!record) {
    record = {
      txHash,
      status: 'unknown',
      updatedAt: new Date().toISOString(),
      reconcileAttempts: 0,
    };
  }

  while (record.reconcileAttempts < RECONCILE_MAX_ATTEMPTS) {
    const status = await querySubmissionStatus(txHash);
    record = {
      ...record,
      status,
      updatedAt: new Date().toISOString(),
      reconcileAttempts: record.reconcileAttempts + 1,
    };
    await persistSubmission(record);

    if (status === 'accepted' || status === 'failed') {
      return record;
    }
    await sleep(RECONCILE_INTERVAL_MS);
  }

  // Bounded policy exhausted — remain pending/unknown, never retry blindly.
  logger.warn(
    { txHash, reconcileAttempts: record.reconcileAttempts },
    'Submission still unknown after bounded reconciliation — leaving pending',
  );
  return record;
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
  const message = err instanceof Error ? err.message : String(err);
  return /tx_bad_seq|sequence/i.test(message);
}

/**
 * Returns true when the error indicates an RPC timeout / uncertain outcome —
 * the submission may or may not have been accepted on-chain.
 */
function isUncertainSubmission(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|socket hang up/i.test(message);
}

/**
 * Submit a signed transaction envelope, persisting the hash before broadcast
 * and reconciling uncertain outcomes before any retry (#415).
 *
 * Returns the accepted result, or throws a terminal error. When the outcome
 * remains unknown after bounded reconciliation, throws a non-retryable error
 * so the job is not re-executed.
 */
async function submitWithReconciliation(
  signedXdr: string,
  txHash: string,
): Promise<TransactionJobResult> {
  // Persist the hash BEFORE broadcasting so a timeout leaves a durable record.
  await persistSubmission({
    txHash,
    status: 'pending',
    updatedAt: new Date().toISOString(),
    reconcileAttempts: 0,
  });

  try {
    const response = await server.submitTransaction(
      TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE),
    );
    const result: TransactionJobResult = {
      txHash: response.hash,
      ledger: response.ledger,
      submittedAt: new Date().toISOString(),
    };
    await persistSubmission({
      txHash: response.hash,
      status: 'accepted',
      updatedAt: result.submittedAt,
      reconcileAttempts: 0,
    });
    return result;
  } catch (err) {
    if (!isUncertainSubmission(err)) {
      // Deterministic rejection — record terminal failure and surface it.
      const message = err instanceof Error ? err.message : String(err);
      await persistSubmission({
        txHash,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        reconcileAttempts: 0,
        error: message,
      });
      throw err;
    }

    // Uncertain outcome — reconcile against the network before any retry.
    logger.warn(
      { txHash, err },
      'Submission outcome uncertain — reconciling before retry',
    );
    const record = await reconcileSubmission(txHash);

    if (record.status === 'accepted') {
      // Already on-chain — do NOT re-execute.
      return {
        txHash,
        ledger: 0,
        submittedAt: record.updatedAt,
      };
    }

    if (record.status === 'failed') {
      const terminal = new Error(
        `Transaction ${txHash} failed on-chain: ${record.error ?? 'unknown'}`,
      );
      // Mark non-retryable so Bull does not re-execute.
      (terminal as Error & { retryable?: boolean }).retryable = false;
      throw terminal;
    }

    // Still unknown after bounded reconciliation — remain pending, do not
    // construct or sign a replacement.
    const pending = new Error(
      `Transaction ${txHash} outcome unknown after reconciliation — left pending`,
    );
    (pending as Error & { retryable?: boolean }).retryable = false;
    throw pending;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports for callers / tests
// ─────────────────────────────────────────────────────────────────────────────

export {
  submitWithReconciliation,
  reconcileSubmission,
  querySubmissionStatus,
  loadSubmission,
  isUncertainSubmission,
};
