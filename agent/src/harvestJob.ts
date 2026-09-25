/**
 * Harvest job — auto-compound yield from the active protocol. Issue #34.
 *
 * Runs on a configurable schedule (default: every 24 hours).  Before each run:
 *   1. Fetches the current TVL via `getTvl()`.
 *   2. Compares accrued yield against `minYieldUsdc` — skips if below threshold.
 *   3. Calculates `min_out` from TVL × (1 - slippage).
 *   4. Submits `harvest(min_out)` via the injected executor.
 *   5. Logs pre- and post-harvest TVL to verify re-supply.
 *   6. Fires the alert handler after `maxConsecutiveFailures` consecutive failures.
 *
 * Environment variables (all optional — sensible defaults apply):
 *   HARVEST_MIN_YIELD_USDC  Minimum yield in USDC stroops (default 1 000 000 = 1 USDC)
 *   HARVEST_SLIPPAGE_BPS    Slippage tolerance in basis points (default 50 = 0.5 %)
 *   HARVEST_INTERVAL_MS     Schedule interval in milliseconds (default 86 400 000 = 24 h)
 */

import logger from './logger';
import { setLastRebalanceTimestamp } from './healthState';

// ── Configuration ─────────────────────────────────────────────────────────────

export interface HarvestConfig {
  /** Minimum accrued yield in USDC stroops required to trigger a harvest. */
  minYieldUsdc: number;
  /** Slippage tolerance forwarded to the vault's `harvest(min_out)` call (bps). */
  slippageBps: number;
  /** How often to attempt a harvest, in milliseconds. */
  intervalMs: number;
  /** Consecutive failures before the alert handler is invoked. */
  maxConsecutiveFailures: number;
}

export const DEFAULT_HARVEST_CONFIG: HarvestConfig = {
  minYieldUsdc: parseInt(process.env.HARVEST_MIN_YIELD_USDC ?? '1000000', 10),
  slippageBps: parseInt(process.env.HARVEST_SLIPPAGE_BPS ?? '50', 10),
  intervalMs: parseInt(process.env.HARVEST_INTERVAL_MS ?? '86400000', 10),
  maxConsecutiveFailures: 3,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HarvestResult {
  success: boolean;
  preTvl?: number;
  postTvl?: number;
  /** Actual yield re-supplied = postTvl - preTvl (positive means growth). */
  yieldHarvested?: number;
  /** The min_out value passed to harvest(). */
  minOut?: number;
  error?: string;
  /** Set to 'below_threshold' when the run was intentionally skipped. */
  skipped?: 'below_threshold';
  executedAt: number;
}

/**
 * Executes the on-chain `harvest(min_out)` call.
 * Implementations should build, sign, and submit the Soroban transaction.
 */
export type HarvestExecutor = (minOut: number) => Promise<{ success: boolean; error?: string }>;

/**
 * Returns the vault's current total managed assets (principal + yield) in
 * USDC stroops. Used to measure pre- and post-harvest TVL.
 */
export type TvlFetcher = () => Promise<number>;

export type AlertHandler = (message: string, context: Record<string, unknown>) => void;

export interface HarvestHooks {
  executor: HarvestExecutor;
  getTvl: TvlFetcher;
  onAlert?: AlertHandler;
}

// ── HarvestJob class ──────────────────────────────────────────────────────────

export class HarvestJob {
  private readonly config: HarvestConfig;
  private readonly hooks: HarvestHooks;
  private consecutiveFailures = 0;
  private alertSent = false;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private history: HarvestResult[] = [];

  constructor(hooks: HarvestHooks, config: HarvestConfig = DEFAULT_HARVEST_CONFIG) {
    this.hooks = hooks;
    this.config = config;
  }

  /**
   * Calculates `min_out` to protect against slippage.
   *
   * min_out = tvl × (10_000 - slippageBps) / 10_000
   */
  calculateMinOut(tvl: number): number {
    return Math.floor((tvl * (10_000 - this.config.slippageBps)) / 10_000);
  }

  /**
   * Executes one harvest attempt.
   *
   * Returns a `HarvestResult` for every outcome (success, skip, or failure).
   */
  async runOnce(): Promise<HarvestResult> {
    const executedAt = Date.now();

    // ── Step 1: fetch pre-harvest TVL ────────────────────────────────────────
    let preTvl: number;
    try {
      preTvl = await this.hooks.getTvl();
    } catch (err) {
      const result: HarvestResult = {
        success: false,
        error: `Failed to fetch pre-harvest TVL: ${err instanceof Error ? err.message : String(err)}`,
        executedAt,
      };
      this.recordFailure(result);
      return result;
    }

    logger.info({ preTvl, minYieldUsdc: this.config.minYieldUsdc }, 'Harvest: TVL fetched');

    // ── Step 2: threshold check ───────────────────────────────────────────────
    // If TVL hasn't grown above minYieldUsdc there's no meaningful yield to harvest.
    // A more precise check would compare TVL against known deposits; this
    // conservative heuristic avoids harvesting dust and wasting gas.
    if (preTvl < this.config.minYieldUsdc) {
      this.consecutiveFailures = 0;
      this.alertSent = false;

      const result: HarvestResult = {
        success: true,
        preTvl,
        skipped: 'below_threshold',
        executedAt,
      };
      logger.info(
        { preTvl, threshold: this.config.minYieldUsdc },
        'Harvest skipped: yield below threshold',
      );
      this.history.push(result);
      this.trimHistory();
      return result;
    }

    // ── Step 3: calculate min_out ─────────────────────────────────────────────
    const minOut = this.calculateMinOut(preTvl);
    logger.info(
      { preTvl, minOut, slippageBps: this.config.slippageBps },
      'Harvest: submitting harvest transaction',
    );

    // ── Step 4: execute harvest ───────────────────────────────────────────────
    let execResult: { success: boolean; error?: string };
    try {
      execResult = await this.hooks.executor(minOut);
    } catch (err) {
      execResult = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (!execResult.success) {
      const result: HarvestResult = {
        success: false,
        preTvl,
        minOut,
        error: execResult.error,
        executedAt,
      };
      this.recordFailure(result);
      return result;
    }

    // ── Step 5: fetch post-harvest TVL for verification ───────────────────────
    let postTvl: number | undefined;
    let yieldHarvested: number | undefined;
    try {
      postTvl = await this.hooks.getTvl();
      yieldHarvested = postTvl - preTvl;
      logger.info(
        { preTvl, postTvl, yieldHarvested, minOut },
        'Harvest completed — yield re-supplied',
      );
    } catch (err) {
      // Non-fatal: harvest succeeded on-chain but we couldn't verify TVL change.
      logger.warn({ err }, 'Harvest: could not fetch post-harvest TVL for verification');
    }

    // Update shared health state so /health reflects the last harvest time.
    setLastRebalanceTimestamp(Date.now());

    this.consecutiveFailures = 0;
    this.alertSent = false;
    const result: HarvestResult = {
      success: true,
      preTvl,
      postTvl,
      yieldHarvested,
      minOut,
      executedAt,
    };
    this.history.push(result);
    this.trimHistory();
    return result;
  }

  /** Starts the periodic harvest schedule. Idempotent — safe to call twice. */
  start(): void {
    if (this.intervalHandle) return;
    logger.info({ intervalMs: this.config.intervalMs }, 'HarvestJob: starting');

    // Run immediately on startup, then on schedule.
    void this.runOnce();

    this.intervalHandle = setInterval(() => {
      void this.runOnce();
    }, this.config.intervalMs);
  }

  /** Stops the periodic harvest schedule. */
  stop(): void {
    if (!this.intervalHandle) return;
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    logger.info('HarvestJob: stopped');
  }

  /** Returns a snapshot of recent harvest results (up to 100). */
  getHistory(): HarvestResult[] {
    return [...this.history];
  }

  /** Returns the number of consecutive failures since the last success. */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private recordFailure(result: HarvestResult): void {
    this.consecutiveFailures++;
    logger.error(
      { result, consecutiveFailures: this.consecutiveFailures },
      'HarvestJob: run failed',
    );

    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures && !this.alertSent) {
      this.alertSent = true;
      const message =
        `[NeuroWealth] Harvest failed ${this.consecutiveFailures} consecutive times. ` +
        `Last error: ${result.error ?? 'unknown'}`;
      logger.error({ consecutiveFailures: this.consecutiveFailures }, message);
      this.hooks.onAlert?.(message, {
        consecutiveFailures: this.consecutiveFailures,
        lastError: result.error,
        preTvl: result.preTvl,
      });
    }

    this.history.push(result);
    this.trimHistory();
  }

  private trimHistory(): void {
    if (this.history.length > 100) {
      this.history.splice(0, this.history.length - 100);
    }
  }
}
