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
import { registerRedisClient } from './redisClients';

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
  /**
   * Whether the underlying adapter data was available. When `false`, the APY
   * fields are placeholders and MUST NOT be treated as a real (e.g. zero-risk)
   * opportunity. Consumers should surface the protocol as unavailable.
   */
  available: boolean;
  /** Reason the adapter was marked unavailable (present only when available=false). */
  unavailableReason?: string;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const REDIS_KEY = 'apy:dex';
const REDIS_TTL_SECONDS = 300; // 5 minutes
const DAYS_IN_YEAR = 365;
const BPS_SCALE = 10_000;

/**
 * Per-adapter deadline (ms). A hung Horizon call cannot block the decision
 * cycle beyond this bound. Overridable via DEX_ADAPTER_TIMEOUT_MS.
 */
export const DEFAULT_ADAPTER_TIMEOUT_MS = 5_000;

function getAdapterTimeoutMs(): number {
  const raw = Number(process.env.DEX_ADAPTER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ADAPTER_TIMEOUT_MS;
}

/**
 * Runs an adapter call bounded by a deadline. Uses AbortController so the
 * underlying fetch is cancelled where supported, and races against a timer so
 * a non-cooperative adapter still cannot block the caller.
 */
async function withDeadline<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = getAdapterTimeoutMs(),
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} exceeded ${timeoutMs}ms deadline`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// Redis client (lazy-init)
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
 *
 * Both Horizon calls are bounded by a per-adapter deadline (see
 * `withDeadline`); a hung Horizon endpoint cannot block the decision cycle.
 */
export async function fetchPoolStats(poolId: string): Promise<PoolStats> {
  const horizonUrl = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

  // 1. Fetch pool details (reserves, fee_bp) — bounded by deadline
  const poolData = await withDeadline('horizon:liquidity_pools', async (signal) => {
    const poolResp = await fetch(`${horizonUrl}/liquidity_pools/${encodeURIComponent(poolId)}`, {
      signal,
    });
    if (!poolResp.ok) {
      throw new Error(
        `Horizon /liquidity_pools/${poolId} returned ${poolResp.status}: ${poolResp.statusText}`,
      );
    }
    return (await poolResp.json()) as {
      reserves: Array<{ asset: string; amount: string }>;
      fee_bp: number;
      total_shares: string;
    };
  });

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

  // 2. Fetch 24h trade data to estimate fee volume — bounded by deadline
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let fees24hUsdc = 0;
  try {
    const tradesData = await withDeadline('horizon:liquidity_pools/trades', async (signal) => {
      const tradesResp = await fetch(
        `${horizonUrl}/liquidity_pools/${encodeURIComponent(poolId)}/trades?limit=200&order=desc`,
        { signal },
      );
      if (!tradesResp.ok) {
        throw new Error(
          `Horizon trades returned ${tradesResp.status}: ${tradesResp.statusText}`,
        );
      }
      return (await tradesResp.json()) as {
        _embedded: { records: Array<{ created_at: string; base_amount: string; counter_amount: string }> };
      };
    });

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
  } catch (err) {
    // Trades are a secondary signal; a timeout/failure here must not fabricate
    // fee volume. Leave fees at 0 and log so the caller can decide.
    logger.warn(
      { err: (err as Error).message, poolId },
      'dex-apy: trades fetch failed or timed out',
    );
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
 * Main DE

/* … truncated 4819 chars — edit only what you need near the top … */
