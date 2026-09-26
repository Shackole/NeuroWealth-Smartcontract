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

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const REDIS_KEY = 'apy:blend';
const REDIS_TTL_SECONDS = 300; // 5 minutes
const BPS_MULTIPLIER = 10_000; // 1.0 = 10_000 BPS

// ─────────────────────────────────────────────────────────────────
// Redis client (lazy-initialised to avoid import-time side-effects)
// ─────────────────────────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
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
 * Main APY fetch function. Returns BPS from Redis cache when available,
 * otherwise fetches from the contract, caches, and snapshots.
 *
 * On contract error, returns the last cached value if one exists.
 */
export async function getBlendApyBps(): Promise<number> {
  const redis = getRedis();

  // 1. Try Redis cache first
  try {
    const cached = await redis.get(REDIS_KEY);
    if (cached !== null) {
      logger.debug({ apyBps: cached }, 'blend-apy: cache hit');
      return parseInt(cached, 10);
    }
  } catch (redisErr) {
    logger.warn({ redisErr }, 'blend-apy: redis read failed, continuing');
  }

  // 2. Fetch from Blend contract
  try {
    const apyBps = await fetchBlendApyFromContract();

    // 3. Cache in Redis
    try {
      await redis.set(REDIS_KEY, apyBps.toString(), 'EX', REDIS_TTL_SECONDS);
    } catch (redisErr) {
      logger.warn({ redisErr }, 'blend-apy: redis write failed');
    }

    // 4. Persist DB snapshot (fire-and-forget)
    void persistApySnapshot(apyBps);

    logger.info({ apyBps }, 'blend-apy: fetched and cached');
    return apyBps;
  } catch (contractErr) {
    logger.error({ contractErr }, 'blend-apy: contract fetch failed');

    // 5. Graceful degradation: return stale cache if available
    try {
      const stale = await redis.get(REDIS_KEY);
      if (stale !== null) {
        logger.warn({ apyBps: stale }, 'blend-apy: returning stale cache on error');
        return parseInt(stale, 10);
      }
    } catch (_) {
      // Redis unavailable — fall through to re-throw original error
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
 *   200 { protocol: "blend", apy_bps: 850, apy_pct: 8.50, cached: bool }
 *   502 { error: "..." }
 */
export function createBlendApyRouter(): Router {
  const router = createRouter();

  router.get('/api/apy/blend', async (_req: Request, res: Response) => {
    try {
      const redis = getRedis();
      const cached = await redis.get(REDIS_KEY).catch(() => null);
      const apyBps = await getBlendApyBps();

      res.json({
        protocol: 'blend',
        apy_bps: apyBps,
        apy_pct: +(apyBps / 100).toFixed(2),
        cached: cached !== null,
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
// ─────────────────────────────────────────────────────────────────

let _pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts a background interval that refreshes the Blend APY cache.
 * Call once at agent startup; call stopBlendApyPoller() on shutdown.
 */
export function startBlendApyPoller(intervalMs = REDIS_TTL_SECONDS * 1000): void {
  if (_pollTimer) return;

  const tick = async () => {
    try {
      const apyBps = await fetchBlendApyFromContract();
      const redis = getRedis();
      await redis.set(REDIS_KEY, apyBps.toString(), 'EX', REDIS_TTL_SECONDS);
      void persistApySnapshot(apyBps);
      logger.info({ apyBps }, 'blend-apy: background poll updated');
    } catch (err) {
      logger.warn({ err }, 'blend-apy: background poll failed (stale cache retained)');
    }
  };

  // Run immediately on start, then on interval
  void tick();
  _pollTimer = setInterval(tick, intervalMs);
  logger.info({ intervalMs }, 'blend-apy: background poller started');
}

export function stopBlendApyPoller(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    logger.info('blend-apy: background poller stopped');
  }
}
