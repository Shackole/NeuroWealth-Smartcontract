/**
 * Strategy Preference Aggregator — Issue #41
 *
 * Extends the AI agent's allocation logic to read per-user strategy preferences
 * from the vault contract via `get_user_strategy` and aggregate them into a
 * pool-level allocation target that guides the rebalance decision.
 *
 * Strategy allocation weights (per acceptance criteria):
 *  - Conservative → 100% Blend,  0% DEX
 *  - Balanced     →  60% Blend, 40% DEX  (default when strategy is unset)
 *  - Growth       →  20% Blend, 80% DEX
 *
 * Pool-level rebalancing is a single on-chain call; strategy preference is
 * advisory (see README). The aggregator computes a weighted average across all
 * active depositors and logs the distribution to the DB on every decision cycle.
 *
 * Exposed API endpoint:
 *   GET /api/agent/strategy-distribution  → StrategyDistributionResponse
 */

import logger from './logger';
import { pool } from './db';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Valid on-chain strategy values (mirrors the contract's `Strategy` enum). */
export type Strategy = 'conservative' | 'balanced' | 'growth';

/** Allocation weights for one strategy: basis points (0–10 000). */
export interface StrategyWeights {
  blendBps: number;
  dexBps: number;
}

/** Per-user strategy query result. */
export interface UserStrategy {
  address: string;
  strategy: Strategy;
  /** `true` when the strategy was defaulted (user has not called `set_user_strategy`). */
  isDefault: boolean;
}

/** Aggregate distribution across all active depositors. */
export interface StrategyDistribution {
  total: number;
  conservative: number;
  balanced: number;
  growth: number;
  conservativePct: number;
  balancedPct: number;
  growthPct: number;
  /** Weighted-average allocation derived from per-user strategies. */
  aggregateBlendBps: number;
  aggregateDexBps: number;
  computedAt: string;
}

/** Full API response shape for GET /api/agent/strategy-distribution. */
export interface StrategyDistributionResponse {
  distribution: StrategyDistribution;
  recommendedAllocation: StrategyWeights;
}

/** Injectable RPC adapter so the aggregator can be tested without a live node. */
export interface VaultRpcAdapter {
  /**
   * Fetch the strategy preference for a single user.
   * Should return the contract default ("balanced") when the entry is absent.
   */
  getUserStrategy(address: string): Promise<Strategy>;
  /**
   * Return all addresses that currently hold non-zero shares.
   * Sourced from the vault's `get_users_with_shares` / UserSharesIndex.
   */
  getActiveDepositors(): Promise<string[]>;
}

// ── Allocation weights ────────────────────────────────────────────────────────

/** Maps a strategy name to its protocol allocation weights in basis points. */
export const STRATEGY_WEIGHTS: Record<Strategy, StrategyWeights> = {
  conservative: { blendBps: 10_000, dexBps: 0 },
  balanced:     { blendBps: 6_000,  dexBps: 4_000 },
  growth:       { blendBps: 2_000,  dexBps: 8_000 },
};

/** Default strategy applied for users who have not called `set_user_strategy`. */
export const DEFAULT_STRATEGY: Strategy = 'balanced';

// ── Aggregation logic ─────────────────────────────────────────────────────────

/**
 * Compute a weighted-average allocation from a distribution count.
 * Each user is treated as having equal weight (one vote per depositor).
 *
 * @example
 * // 2 conservative, 1 balanced, 1 growth
 * // blendBps = (2*10000 + 1*6000 + 1*2000) / 4 = 7000
 * // dexBps   = (2*0     + 1*4000 + 1*8000) / 4 = 3000
 */
export function computeAggregateAllocation(distribution: {
  conservative: number;
  balanced: number;
  growth: number;
}): StrategyWeights {
  const total = distribution.conservative + distribution.balanced + distribution.growth;
  if (total === 0) {
    return STRATEGY_WEIGHTS[DEFAULT_STRATEGY];
  }

  const weightedBlend =
    distribution.conservative * STRATEGY_WEIGHTS.conservative.blendBps +
    distribution.balanced     * STRATEGY_WEIGHTS.balanced.blendBps +
    distribution.growth       * STRATEGY_WEIGHTS.growth.blendBps;

  const weightedDex =
    distribution.conservative * STRATEGY_WEIGHTS.conservative.dexBps +
    distribution.balanced     * STRATEGY_WEIGHTS.balanced.dexBps +
    distribution.growth       * STRATEGY_WEIGHTS.growth.dexBps;

  return {
    blendBps: Math.round(weightedBlend / total),
    dexBps: Math.round(weightedDex / total),
  };
}

// ── Aggregator ────────────────────────────────────────────────────────────────

/**
 * Fetches strategies for all active depositors in batches, aggregates the
 * distribution, and optionally persists it to the database.
 *
 * @param rpc       - Injectable RPC adapter (stub-friendly for tests).
 * @param batchSize - Number of concurrent `get_user_strategy` RPC calls.
 * @returns         - `StrategyDistribution` including the recommended allocation.
 */
export async function aggregateStrategyPreferences(
  rpc: VaultRpcAdapter,
  batchSize = 20,
  persistToDb = true,
): Promise<StrategyDistribution> {
  const depositors = await rpc.getActiveDepositors();
  logger.info(
    { depositorCount: depositors.length },
    '[StrategyAggregator] Fetching per-user strategies',
  );

  const counts: Record<Strategy, number> = {
    conservative: 0,
    balanced: 0,
    growth: 0,
  };

  // Process depositors in batches to avoid overwhelming the RPC node.
  for (let i = 0; i < depositors.length; i += batchSize) {
    const batch = depositors.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((addr) => rpc.getUserStrategy(addr)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        const strategy = result.value ?? DEFAULT_STRATEGY;
        counts[strategy] = (counts[strategy] ?? 0) + 1;
      } else {
        // Unset / RPC error → default to balanced.
        logger.warn(
          { address: batch[j], error: result.reason },
          '[StrategyAggregator] Failed to fetch user strategy; defaulting to balanced',
        );
        counts.balanced += 1;
      }
    }
  }

  const total = counts.conservative + counts.balanced + counts.growth;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 10000) / 100 : 0;

  const aggregate = computeAggregateAllocation(counts);

  const distribution: StrategyDistribution = {
    total,
    conservative: counts.conservative,
    balanced: counts.balanced,
    growth: counts.growth,
    conservativePct: pct(counts.conservative),
    balancedPct: pct(counts.balanced),
    growthPct: pct(counts.growth),
    aggregateBlendBps: aggregate.blendBps,
    aggregateDexBps: aggregate.dexBps,
    computedAt: new Date().toISOString(),
  };

  logger.info(
    {
      distribution,
      recommendedAllocation: aggregate,
    },
    '[StrategyAggregator] Strategy distribution computed',
  );

  if (persistToDb && process.env.DATABASE_URL) {
    await persistDistribution(distribution);
  }

  return distribution;
}

// ── DB persistence ────────────────────────────────────────────────────────────

/**
 * Persist the strategy distribution summary to the `strategy_distributions`
 * table. The table is created lazily (CREATE TABLE IF NOT EXISTS) so a schema
 * migration is not required for existing deployments.
 */
async function persistDistribution(d: StrategyDistribution): Promise<void> {
  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS strategy_distributions (
         id              SERIAL PRIMARY KEY,
         total_users     INTEGER NOT NULL,
         conservative    INTEGER NOT NULL,
         balanced        INTEGER NOT NULL,
         growth          INTEGER NOT NULL,
         blend_bps       INTEGER NOT NULL,
         dex_bps         INTEGER NOT NULL,
         computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );

    await pool.query(
      `INSERT INTO strategy_distributions
         (total_users, conservative, balanced, growth, blend_bps, dex_bps, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        d.total,
        d.conservative,
        d.balanced,
        d.growth,
        d.aggregateBlendBps,
        d.aggregateDexBps,
        d.computedAt,
      ],
    );

    logger.debug('[StrategyAggregator] Distribution persisted to DB');
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : err },
      '[StrategyAggregator] DB persistence failed',
    );
  }
}

// ── In-memory cache for the API endpoint ─────────────────────────────────────

/** Latest computed distribution (populated after each decision cycle). */
let latestDistribution: StrategyDistribution | null = null;

export function setLatestDistribution(d: StrategyDistribution): void {
  latestDistribution = d;
}

export function getLatestDistribution(): StrategyDistribution | null {
  return latestDistribution;
}

// ── Express router ────────────────────────────────────────────────────────────

import express from 'express';

export const strategyRouter = express.Router();

/**
 * GET /api/agent/strategy-distribution
 *
 * Returns the most-recently computed strategy distribution and the resulting
 * recommended allocation (blend_bps / dex_bps).
 *
 * 204 when no distribution has been computed yet (first cycle not complete).
 */
strategyRouter.get('/api/agent/strategy-distribution', (_req, res) => {
  const dist = getLatestDistribution();
  if (!dist) {
    res.status(204).json({ message: 'No distribution available yet; first decision cycle pending' });
    return;
  }

  const recommendedAllocation = computeAggregateAllocation({
    conservative: dist.conservative,
    balanced: dist.balanced,
    growth: dist.growth,
  });

  const response: StrategyDistributionResponse = {
    distribution: dist,
    recommendedAllocation,
  };

  res.status(200).json(response);
});

// ── Default RPC adapter (production) ─────────────────────────────────────────

/**
 * Production RPC adapter that calls the vault contract via Stellar SDK.
 * Replace the stub bodies with real SorobanRpc invocations in your deployment.
 */
export function createDefaultRpcAdapter(
  rpcUrl = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  vaultContractId = process.env.VAULT_CONTRACT_ID ?? '',
): VaultRpcAdapter {
  return {
    async getActiveDepositors(): Promise<string[]> {
      // TODO: Call vault's `get_users_with_shares` / UserSharesIndex via
      // SorobanRpc to enumerate all depositors.
      // Stub: return empty list (the real implementation queries the contract).
      logger.warn('[StrategyAggregator] getActiveDepositors stub — implement with real RPC');
      return [];
    },

    async getUserStrategy(address: string): Promise<Strategy> {
      // TODO: Call vault's `get_user_strategy(address)` via SorobanRpc.
      // The contract returns "balanced" by default when the key is unset.
      // Stub: return the default.
      logger.debug({ address }, '[StrategyAggregator] getUserStrategy stub — returning default');
      return DEFAULT_STRATEGY;
    },
  };
}
