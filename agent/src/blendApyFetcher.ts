/**
 * Blend Protocol APY fetcher — Issue #27
 *
 * Fetches the current USDC supply APY from the Blend lending pool contract
 * on Stellar. Results are:
 *  - Cached in Redis (key: `apy:blend`, TTL: 300 s)
 *  - Returned as an integer in basis points (BPS). e.g. 850 = 8.50%
 *  - Snapshotted to the `apy_snapshots` DB table on every successful fetch
 *
 * Graceful degradation: if the Blend contract call fails, the last cached
 * value is returned instead. If there is no cache, the error is propagated.
 *
 * Freshness (Issue #422): every sample carries the observation timestamp and
 * source identifier so downstream yield comparison can reject stale APY
 * before making allocation decisions.
 *
 * Environment variables required:
 *   BLEND_POOL_ADDRESS   — Soroban contract ID of the Blend lending pool
 *   BLEND_USDC_ASSET     — Soroban USDC contract ID used by the pool
 *   STELLAR_RPC_URL      — Soroban RPC endpoint (e.g. Horizon testnet)
 *   REDIS_URL            — Redis connection URL (default: redis://localhost:6379)
 */

import { SorobanRpc, Contract, xdr, scValToNative } from '@stellar/stellar-sdk';
import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { Redis } from 'ioredis';
import { pool } from './db';
import logger from './logger';
import { registerRedisClient } from './redisClients';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const REDIS_KEY = 'apy:blend';
const REDIS_TTL_SECONDS = 300; // 5 minutes
const BPS_MULTIPLIER = 10_000; // 1.0 = 10_000 BPS
const SOURCE_ID = 'blend';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

/**
 * An APY observation carrying provenance so freshness can be validated
 * before allocation decisions (Issue #422).
 */
export interface ApySample {
  /** APY in basis points (e.g. 850 = 8.50%). */
  apyBps: number;
  /** Source identifier, e.g. "blend". */
  source: string;
  /** ISO-8601 timestamp of when the sample was observed. */
  observedAt: string;
  /** True when the value came from cache rather than a live fetch. */
  cached: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Redis client (lazy-initialised to avoid import-time side-effects)
// ─────────────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = registerRedisClient(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    }));
    _redis.on('error', (err: Error) =>
      logger.warn({ err: err.message }, 'blend-apy: redis error'),
    );
  }
  return _redis;
}

// ─────────────────────────────────────────────────────────────────
// Core fetch logic
// ─────────────────────────────────────────────────────────────────

/**
 * Calls the Blend pool contract's `get_reserve` function to obtain the
 * current supply APY for USDC.
 *
 * Blend returns the APY as a fixed-point decimal scaled by 1e7 (Stellar
 * stroop convention). We convert that to BPS:
 *
 *   BPS = (raw_apy / 1e7) * 10_000
 *
 * Reference:
 *   https://docs.blend.capital/tech-docs/core-contracts/lending-pool/pool-state
 */
async function fetchBlendApyFromContract(): Promise<number> {
  const rpcUrl = process.env.STELLAR_RPC_URL;
  const poolAddress = process.env.BLEND_POOL_ADDRESS;
  const usdcAsset = process.env.BLEND_USDC_ASSET;

  if (!rpcUrl || !poolAddress || !usdcAsset) {
    throw new Error(
      'Missing required env vars: STELLAR_RPC_URL, BLEND_POOL_ADDRESS, BLEND_USDC_ASSET',
    );
  }

  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: true });
  const contract = new Contract(poolAddress);

  // Invoke the Blend pool's `get_reserve` view function.
  // The function returns a ReserveData struct; we read `supply_rate` from it.
  const operation = contract.call(
    'get_reserve',
    xdr.ScVal.scvAddress(
      xdr.ScAddress.scAddressTypeContract(
        Buffer.from(usdcAsset, 'hex'),
      ),
    ),
  );

  const tx = await server.simulateTransaction(
    new (await import('@stellar/stellar-sdk')).TransactionBuilder(
      await server.getAccount('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
      { fee: '100', networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015' },
    )
      .addOperation(operation)
      .setTimeout(30)
      .build(),
  );

  if (SorobanRpc.Api.isSimulationError(tx)) {
    throw new Error(`Blend simulateTransaction error: ${tx.error}`);
  }

  const result = scValToNative((tx as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);

  // Blend ReserveData has a `supply_rate` field (u32, scaled by 1e7)
  const supplyRate: number =
    typeof result === 'object' && result !== null && 'supply_rate' in result
      ? Number(result.supply_rate)
      : typeof result === 'bigint'
      ? Number(result)
      : Number(result);

  // Convert stroop-scaled rate to BPS
  // Blend supply_rate: u32 where 1e7 = 100% APY, so divide by 1e7 to get fraction,
  // then multiply by 10_000 to get BPS.
  // e.g. supply_rate = 850_000 → 0.085 → 850 BPS = 8.50%
  const apyBps = Math.round((supplyRate / 1e7) * BPS_MULTIPLIER);
  return apyBps;
}

/**
 * Writes an APY snapshot row to the `apy_snapshots` DB table.
 * Failures are logged but do not surface to callers.
 */
async function persistApySnapshot(apyBps: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO apy_snapshots (protocol, apy_bps, recorded_at)
       VALUES ('blend', $1, NOW())`,
      [apyBps],
    );
    logger.debug({ apyBps }, 'blend-apy: snapshot persisted');
  } catch (err) {
    logger.error({ err }, 'blend-apy: failed to persist snapshot');
  }
}

/**
 * Reads the cached sample (value + observation timestamp) from Redis.
 * Returns null when no cache entry exists or Redis is unavailable.
 */
async function readCachedSample(): Promise<ApySample | null> {
  try {
    const cached = await getRedis().get(REDIS_KEY);
    if (cached === null) return null;
    const parsed = JSON.parse(cached) as { apyBps: number; observedAt: string };
    return {
      apyBps: parsed.apyBps,
      source: SOURCE_ID,
      observedAt: parsed.observedAt,
      cached: true,
    };
  } catch (redisErr) {
    logger.warn({ redisErr }, 'blend-apy: redis read failed, continuing');
    return null;
  }
}

/**
 * Main APY fetch function. Returns BPS from Redis cache when available,
 * otherwise fetches from the contract, caches, and snapshots.
 *
 * On contract error, returns the last cached value if one exists.
 */
export async function getBlendApyBps(): Promise<number> {
  const sample = await getBlendApySample();
  return sample.apyBps;
}

/**
 * Returns an APY sample carrying its observation timestamp and source so
 * callers can validate freshness before allocation decisions (Issue #422).
 *
 * On contract error, returns the last cached sample if one exists.
 */
export async function getBlendApySample(): Promise<ApySample> {
  const redis = getRedis();

  // 1. Try Redis cache first
  const cachedSample = await readCachedSample();
  if (cachedSample !== null) {
    logger.debug({ apyBps: cachedSample.apyBps }, 'blend-apy: cache hit');
    return cachedSample;
  }

  // 2. Fetch from Blend contract
  try {
    const apyBps = await fetchBlendApyFromContract();
    const observedAt = new Date().toISOString();

    // 3. Cache in Redis (value + observation timestamp)
    try {
      await redis.set(
        REDIS_KEY,
        JSON.stringify({ apyBps, observedAt }),
        'EX',
        REDIS_TTL_SECONDS,
      );
    } catch (redisErr) {
      logger.warn({ redisErr }, 'blend-apy: redis write failed');
    }

    // 4. Persist DB snapshot (fire-and-forget)
    void persistApySnapshot(apyBps);

    logger.info({ apyBps, observedAt }, 'blend-apy: fetched and cached');
    return { apyBps, source: SOURCE_ID, observedAt, cached: false };
  } catch (contractErr) {
    logger.error({ contractErr }, 'blend-apy: contract fetch failed');

    // 5. Graceful degradation: return stale cache if available
    const stale = await readCachedSample();
    if (stale !== null) {
      logger.warn(
        { apyBps: stale.apyBps, observedAt: stale.observedAt },
        'blend-apy: returning stale cache on error',
      );
      return stale;
    }

    throw contractErr;
  }
}

// ─────────────────────────────────────────────────────────────────
// Express router — GET /api/apy/blend
// ─────────────────────────────────────────────────────────────────

/**
 * Mounts the /api/apy/blend endpoint on the provided Express router.
 *
 * Response shape:
 *   200 { protocol: "blend", apy_bps: 850, apy_pct: 8.50, cached: bool,
 *         source: "blend", observed_at: ISO-8601 }
 *   502 { error: "..." }
 */
export function createBlendApyRouter(): Router {
  const router = createRouter();

  router.get('/api/apy/blend', async (_req: Request, res: Response) => {
    try {
      const sample = await getBlendApySample();

      res.json({
        protocol: 'blend',
        apy_bps: sample.apyBps,
        apy_pct: +(sample.apyBps / 100).toFixed(2),
        cached: sample.cached,
        source: sample.source,
        observed_at: sample.observedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, 'GET /api/apy/blend failed');
      res.status(502).json({ error: `Failed to fetch Blend APY: ${message}` });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────────
// Background poller — refreshes cache every 5 minutes
// ─────────────────────────────────────────────────────────────

/* … truncated 1123 chars — edit only what you need near the top … */
