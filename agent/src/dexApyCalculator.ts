/**
 * DEX Liquidity Pool APY Calculator — Issue #28
 *
 * Computes the estimated APY for a Stellar DEX USDC liquidity pool position.
 *
 * Formula:
 *   raw_apy_bps = (fees_24h / pool_tvl) * 365 * 10_000
 *   il_adjustment_bps = estimateILAdjustmentBps(price_volatility)
 *   risk_adjusted_apy_bps = raw_apy_bps - il_adjustment_bps
 *
 * Results are:
 *   - Cached in Redis (key: `apy:dex`, TTL: 300 s)
 *   - Returned as an integer in BPS (e.g. 820 = 8.20%)
 *   - Snapshotted to the `apy_snapshots` DB table on every successful fetch
 *
 * Environment variables required:
 *   STELLAR_HORIZON_URL        — Horizon REST endpoint (e.g. https://horizon-testnet.stellar.org)
 *   DEX_USDC_POOL_ID           — Stellar liquidity pool ID for the USDC pair
 *   DEX_PRICE_VOLATILITY_PCT   — Optional: expected 30-day price volatility % (default: 5.0)
 *   REDIS_URL                  — Redis connection URL (default: redis://localhost:6379)
 *
 * Reference:
 *   Stellar Horizon /liquidity_pools/:id and /liquidity_pools/:id/trades
 *   docs/DEX_INTEGRATION.md
 */

import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { Redis } from 'ioredis';
import { pool } from './db';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface PoolStats {
  /** Pool TVL denominated in USDC (7 decimal stroop-equivalent value). */
  tvlUsdc: number;
  /** Total fee volume generated in the last 24 hours in USDC. */
  fees24hUsdc: number;
  /** Price ratio of the two assets at the time of fetch. */
  priceRatio: number;
}

export interface DexApyResult {
  /** Raw LP fee APY without IL adjustment (BPS). */
  rawApyBps: number;
  /** Impermanent-loss risk adjustment (BPS, always >= 0). */
  ilAdjustmentBps: number;
  /** Risk-adjusted APY: rawApyBps - ilAdjustmentBps (BPS, floor 0). */
  riskAdjustedApyBps: number;
  /** Whether the result was served from Redis cache. */
  cached: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const REDIS_KEY = 'apy:dex';
const REDIS_TTL_SECONDS = 300; // 5 minutes
const DAYS_IN_YEAR = 365;
const BPS_SCALE = 10_000;

// ─────────────────────────────────────────────────────────────────
// Redis client (lazy-init)
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
      logger.warn({ err: err.message }, 'dex-apy: redis error'),
    );
  }
  return _redis;
}

// ─────────────────────────────────────────────────────────────────
// Impermanent Loss estimate
// ─────────────────────────────────────────────────────────────────

/**
 * Estimates the IL drag in BPS given a price volatility percentage.
 *
 * Uses the standard constant-product AMM IL formula approximation:
 *   IL ≈ 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
 *
 * where price_ratio = 1 ± (volatility / 100).
 *
 * For low volatility (stablecoin pools) this returns a small number.
 * For high volatility (e.g. XLM/USDC) this can be significant.
 *
 * Reference: https://pintail.medium.com/uniswap-a-good-deal-for-liquidity-providers-104c0b6816f2
 *
 * @param volatilityPct — expected price volatility over the holding period (0–100)
 * @returns IL adjustment in BPS (>= 0)
 */
export function estimateILAdjustmentBps(volatilityPct: number): number {
  if (volatilityPct <= 0) return 0;

  // Cap extreme volatility at 100% to avoid nonsensical outputs
  const v = Math.min(volatilityPct, 100) / 100;

  // price_ratio represents the price change at the high end
  const priceRatio = 1 + v;

  // Standard IL formula: IL = 2√k / (1+k) − 1  where k = price_ratio
  const sqrtK = Math.sqrt(priceRatio);
  const ilFraction = (2 * sqrtK) / (1 + priceRatio) - 1;

  // IL is negative (loss), we take the absolute value for the adjustment
  const ilBps = Math.round(Math.abs(ilFraction) * BPS_SCALE);
  return ilBps;
}

// ─────────────────────────────────────────────────────────────────
// Pool stats fetcher — Stellar Horizon REST API
// ─────────────────────────────────────────────────────────────────

/**
 * Fetches pool reserves and 24h fee volume from Stellar Horizon.
 *
 * Horizon liquidity_pools endpoint:
 *   GET /liquidity_pools/:id
 *   Returns: reserves[], fee_bp, total_shares, etc.
 *
 * 24h fee volume is computed from:
 *   fee_earned = trade_volume_24h * (fee_bp / 10_000)
 *
 * We approximate 24h trade volume by fetching the last 24h of trades
 * for the pool and summing the base amounts.
 */
export async function fetchPoolStats(poolId: string): Promise<PoolStats> {
  const horizonUrl = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

  // 1. Fetch pool details (reserves, fee_bp)
  const poolResp = await fetch(`${horizonUrl}/liquidity_pools/${encodeURIComponent(poolId)}`);
  if (!poolResp.ok) {
    throw new Error(
      `Horizon /liquidity_pools/${poolId} returned ${poolResp.status}: ${poolResp.statusText}`,
    );
  }
  const poolData = (await poolResp.json()) as {
    reserves: Array<{ asset: string; amount: string }>;
    fee_bp: number;
    total_shares: string;
  };

  // Compute TVL: sum of both reserve amounts in USDC
  // For a USDC/XLM pool, the USDC reserve is the pool_tvl denominator;
  // we use both sides converted at current price for a full TVL estimate.
  const usdcReserve = parseFloat(
    poolData.reserves.find((r) => r.asset === 'native' || r.asset.startsWith('USDC'))?.amount ?? '0',
  );
  const otherReserve = parseFloat(
    poolData.reserves.find((r) => !r.asset.startsWith('USDC'))?.amount ?? '0',
  );

  // If we can identify both sides, use 2× the USDC side as TVL proxy
  // (assumes roughly equal value split at current price)
  const tvlUsdc = usdcReserve > 0 ? usdcReserve * 2 : otherReserve;

  // Price ratio: other asset / USDC (simple ratio for IL calculation)
  const priceRatio = usdcReserve > 0 && otherReserve > 0 ? otherReserve / usdcReserve : 1;

  // 2. Fetch 24h trade data to estimate fee volume
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tradesResp = await fetch(
    `${horizonUrl}/liquidity_pools/${encodeURIComponent(poolId)}/trades?limit=200&order=desc`,
  );

  let fees24hUsdc = 0;
  if (tradesResp.ok) {
    const tradesData = (await tradesResp.json()) as {
      _embedded: { records: Array<{ created_at: string; base_amount: string; counter_amount: string }> };
    };
    const trades = tradesData._embedded?.records ?? [];

    // Sum trade volumes in the last 24h
    let volume24h = 0;
    for (const trade of trades) {
      if (new Date(trade.created_at) < new Date(oneDayAgo)) break;
      volume24h += parseFloat(trade.base_amount ?? '0');
      volume24h += parseFloat(trade.counter_amount ?? '0');
    }

    // fee_bp is the pool's fee in basis points (e.g. 30 = 0.30%)
    const feeBp = poolData.fee_bp ?? 30;
    fees24hUsdc = volume24h * (feeBp / BPS_SCALE);
  }

  return { tvlUsdc, fees24hUsdc, priceRatio };
}

// ─────────────────────────────────────────────────────────────────
// Core APY calculation
// ─────────────────────────────────────────────────────────────────

/**
 * Calculates annualised LP APY in BPS.
 *
 *   raw_apy_bps = (fees_24h / pool_tvl) × 365 × 10_000
 *
 * Returns 0 if tvl is 0 to avoid division by zero.
 */
export function calculateRawApyBps(fees24hUsdc: number, tvlUsdc: number): number {
  if (tvlUsdc <= 0 || fees24hUsdc < 0) return 0;
  const rawApy = (fees24hUsdc / tvlUsdc) * DAYS_IN_YEAR * BPS_SCALE;
  return Math.max(0, Math.round(rawApy));
}

/**
 * Main DEX APY function. Returns risk-adjusted APY in BPS.
 *
 * Cache-first: tries Redis, falls back to live calculation on miss.
 * On fetch error: returns last cached value or propagates the error.
 */
export async function getDexApyBps(): Promise<DexApyResult> {
  const redis = getRedis();
  const poolId = process.env.DEX_USDC_POOL_ID;

  if (!poolId) {
    throw new Error('Missing required env var: DEX_USDC_POOL_ID');
  }

  // 1. Try Redis cache
  try {
    const cached = await redis.get(REDIS_KEY);
    if (cached !== null) {
      const parsed = JSON.parse(cached) as DexApyResult;
      logger.debug({ apyBps: parsed.riskAdjustedApyBps }, 'dex-apy: cache hit');
      return { ...parsed, cached: true };
    }
  } catch (redisErr) {
    logger.warn({ redisErr }, 'dex-apy: redis read failed, continuing');
  }

  // 2. Fetch live from Horizon
  try {
    const stats = await fetchPoolStats(poolId);
    const volatilityPct = parseFloat(process.env.DEX_PRICE_VOLATILITY_PCT ?? '5.0');

    const rawApyBps = calculateRawApyBps(stats.fees24hUsdc, stats.tvlUsdc);
    const ilAdjustmentBps = estimateILAdjustmentBps(volatilityPct);
    const riskAdjustedApyBps = Math.max(0, rawApyBps - ilAdjustmentBps);

    const result: DexApyResult = {
      rawApyBps,
      ilAdjustmentBps,
      riskAdjustedApyBps,
      cached: false,
    };

    // 3. Cache in Redis
    try {
      await redis.set(REDIS_KEY, JSON.stringify(result), 'EX', REDIS_TTL_SECONDS);
    } catch (redisErr) {
      logger.warn({ redisErr }, 'dex-apy: redis write failed');
    }

    // 4. Persist DB snapshot (fire-and-forget)
    void persistApySnapshot(riskAdjustedApyBps);

    logger.info({ rawApyBps, ilAdjustmentBps, riskAdjustedApyBps }, 'dex-apy: calculated');
    return result;
  } catch (fetchErr) {
    logger.error({ fetchErr }, 'dex-apy: fetch failed');

    // 5. Graceful degradation: return stale cache if available
    try {
      const stale = await redis.get(REDIS_KEY);
      if (stale !== null) {
        const parsed = JSON.parse(stale) as DexApyResult;
        logger.warn({ apyBps: parsed.riskAdjustedApyBps }, 'dex-apy: returning stale cache');
        return { ...parsed, cached: true };
      }
    } catch (_) {
      // Redis unavailable — fall through
    }

    throw fetchErr;
  }
}

// ─────────────────────────────────────────────────────────────────
// DB snapshot
// ─────────────────────────────────────────────────────────────────

async function persistApySnapshot(apyBps: number): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO apy_snapshots (protocol, apy_bps, recorded_at)
       VALUES ('dex', $1, NOW())`,
      [apyBps],
    );
    logger.debug({ apyBps }, 'dex-apy: snapshot persisted');
  } catch (err) {
    logger.error({ err }, 'dex-apy: failed to persist snapshot');
  }
}

// ─────────────────────────────────────────────────────────────────
// Express router — GET /api/apy/dex
// ─────────────────────────────────────────────────────────────────

/**
 * Response shape:
 *   200 {
 *     protocol: "dex",
 *     raw_apy_bps: 950,
 *     il_adjustment_bps: 42,
 *     apy_bps: 908,
 *     apy_pct: 9.08,
 *     cached: bool
 *   }
 *   502 { error: "..." }
 */
export function createDexApyRouter(): Router {
  const router = createRouter();

  router.get('/api/apy/dex', async (_req: Request, res: Response) => {
    try {
      const result = await getDexApyBps();
      res.json({
        protocol: 'dex',
        raw_apy_bps: result.rawApyBps,
        il_adjustment_bps: result.ilAdjustmentBps,
        apy_bps: result.riskAdjustedApyBps,
        apy_pct: +(result.riskAdjustedApyBps / 100).toFixed(2),
        cached: result.cached,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message }, 'GET /api/apy/dex failed');
      res.status(502).json({ error: `Failed to fetch DEX APY: ${message}` });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────────
// Background poller
// ─────────────────────────────────────────────────────────────────

let _pollTimer: ReturnType<typeof setInterval> | null = null;

export function startDexApyPoller(intervalMs = REDIS_TTL_SECONDS * 1000): void {
  if (_pollTimer) return;

  const tick = async () => {
    try {
      await getDexApyBps();
      logger.info('dex-apy: background poll updated');
    } catch (err) {
      logger.warn({ err }, 'dex-apy: background poll failed');
    }
  };

  void tick();
  _pollTimer = setInterval(tick, intervalMs);
  logger.info({ intervalMs }, 'dex-apy: background poller started');
}

export function stopDexApyPoller(): void {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    logger.info('dex-apy: background poller stopped');
  }
}
