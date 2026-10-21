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
 * Durable distributed lease table used by the scheduler so that only one
 * replica owns a given rebalance interval. A crashed owner is replaced once
 * its lease expires (expires_at < now()).
 */
export async function ensureSchedulerLeaseTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduler_leases (
      lease_key TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      renewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/**
 * Attempt to acquire (or renew) a lease for `leaseKey` on behalf of `ownerId`.
 * Returns true when the caller now owns the lease. Acquisition is atomic: a
 * single conditional upsert only succeeds if the lease is free, expired, or
 * already held by the same owner.
 */
export async function acquireLease(
  leaseKey: string,
  ownerId: string,
  ttlMs: number
): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO scheduler_leases (lease_key, owner_id, expires_at, renewed_at)
     VALUES ($1, $2, now() + ($3::int * interval '1 millisecond'), now())
     ON CONFLICT (lease_key) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           expires_at = EXCLUDED.expires_at,
           renewed_at = now()
       WHERE scheduler_leases.owner_id = EXCLUDED.owner_id
          OR scheduler_leases.expires_at < now()
     RETURNING owner_id`,
    [leaseKey, ownerId, ttlMs]
  );
  return result.rowCount === 1 && result.rows[0].owner_id === ownerId;
}

/**
 * Release a lease held by `ownerId`. Returns true when the lease was released
 * by this owner (false if it was already expired/reassigned).
 */
export async function releaseLease(
  leaseKey: string,
  ownerId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM scheduler_leases WHERE lease_key = $1 AND owner_id = $2`,
    [leaseKey, ownerId]
  );
  return (result.rowCount ?? 0) > 0;
}
