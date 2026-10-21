import { Pool, PoolConfig } from 'pg';
import logger from './logger';

const maxPoolSize = parseInt(process.env.MAX_DB_POOL_SIZE || '10', 10);
const minPoolSize = parseInt(process.env.MIN_DB_POOL_SIZE || '2', 10);
const idleTimeout = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
const connTimeout = parseInt(process.env.DB_CONN_TIMEOUT_MS || '5000', 10);

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: maxPoolSize,
  min: minPoolSize,
  idleTimeoutMillis: idleTimeout,
  connectionTimeoutMillis: connTimeout,
};

export const pool = new Pool(poolConfig);

// Pool error handling & monitoring
pool.on('error', (err) => {
  logger.error({ error: err.message }, 'Unexpected PostgreSQL connection pool error');
});

pool.on('connect', () => {
  logger.debug('New client connected to PostgreSQL pool');
});

export function getPoolMetrics() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    maxPoolSize,
    minPoolSize,
  };
}

/**
 * Durable record of an in-flight transaction submission.
 *
 * A row is written (status `submitted`) before the transaction is broadcast so
 * that an RPC timeout leaves a durable hash we can reconcile against the
 * network before ever constructing or signing a replacement.
 */
export type TransactionSubmissionStatus =
  | 'submitted'
  | 'pending'
  | 'success'
  | 'failed';

export interface TransactionSubmissionRecord {
  id: number;
  account: string;
  txHash: string;
  status: TransactionSubmissionStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let submissionsTableReady: Promise<void> | null = null;

/**
 * Ensure the transaction submission ledger exists. Idempotent and memoized so
 * callers can await it cheaply on every submission.
 */
export function ensureTransactionSubmissionsTable(): Promise<void> {
  if (!submissionsTableReady) {
    submissionsTableReady = pool
      .query(
        `CREATE TABLE IF NOT EXISTS transaction_submissions (
           id SERIAL PRIMARY KEY,
           account TEXT NOT NULL,
           tx_hash TEXT NOT NULL UNIQUE,
           status TEXT NOT NULL DEFAULT 'submitted',
           attempts INTEGER NOT NULL DEFAULT 1,
           last_error TEXT,
           created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined)
      .catch((err) => {
        submissionsTableReady = null;
        throw err;
      });
  }
  return submissionsTableReady;
}

/**
 * Persist a transaction hash before broadcast. Returns the existing record when
 * the hash was already recorded (e.g. a retried submission of the same tx).
 */
export async function recordTransactionSubmission(
  account: string,
  txHash: string,
): Promise<TransactionSubmissionRecord> {
  await ensureTransactionSubmissionsTable();
  const { rows } = await pool.query<TransactionSubmissionRecord>(
    `INSERT INTO transaction_submissions (account, tx_hash, status)
     VALUES ($1, $2, 'submitted')
     ON CONFLICT (tx_hash) DO UPDATE
       SET attempts = transaction_submissions.attempts + 1,
           updated_at = now()
     RETURNING id, account, tx_hash AS "txHash", status, attempts,
               last_error AS "lastError", created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [account, txHash],
  );
  return rows[0];
}

/**
 * Look up a previously recorded submission by hash so an uncertain result can
 * be reconciled instead of blindly retried.
 */
export async function getTransactionSubmission(
  txHash: string,
): Promise<TransactionSubmissionRecord | null> {
  await ensureTransactionSubmissionsTable();
  const { rows } = await pool.query<TransactionSubmissionRecord>(
    `SELECT id, account, tx_hash AS "txHash", status, attempts,
            last_error AS "lastError", created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM transaction_submissions
      WHERE tx_hash = $1`,
    [txHash],
  );
  return rows[0] ?? null;
}

/**
 * Update the reconciliation status of a recorded submission. Terminal states
 * (`success`, `failed`) are sticky: once recorded they are not overwritten by a
 * later `pending`/`submitted` observation.
 */
export async function updateTransactionSubmissionStatus(
  txHash: string,
  status: TransactionSubmissionStatus,
  lastError: string | null = null,
): Promise<TransactionSubmissionRecord | null> {
  await ensureTransactionSubmissionsTable();
  const { rows } = await pool.query<TransactionSubmissionRecord>(
    `UPDATE transaction_submissions
        SET status = CASE
              WHEN status IN ('success', 'failed') THEN status
              ELSE $2
            END,
            last_error = COALESCE($3, last_error),
            updated_at = now()
      WHERE tx_hash = $1
      RETURNING id, account, tx_hash AS "txHash", status, attempts,
                last_error AS "lastError", created_at AS "createdAt",
                updated_at AS "updatedAt"`,
    [txHash, status, lastError],
  );
  return rows[0] ?? null;
}
