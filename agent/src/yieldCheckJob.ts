/**
 * Yield-check Bull-style queue job — Issue #22.
 *
 * Runs every 60 minutes to:
 *  1. Fetch current APY from Blend and all active DEX pools.
 *  2. Compare against the vault's currently-deployed protocol APY.
 *  3. Trigger rebalance(protocol, expected_apy, min_out) when improvement > 0.5%.
 *  4. Respect the vault's on-chain rebalance cooldown.
 *  5. Log every decision (protocol chosen, expected APY, reason).
 *  6. Store results in PostgreSQL for analytics.
 *
 * The queue is transport-agnostic: all external calls are injected via
 * `YieldCheckHooks`, making unit tests straightforward without network access.
 *
 * Technical notes (Issue #22):
 *  - rebalance_cooldown check: current_ledger - get_last_rebalance_ledger >= get_rebalance_cooldown
 *  - min_out = deployedAmount * (1 - SLIPPAGE_BPS / 10_000)
 *  - Uses @stellar/stellar-sdk to submit the rebalance transaction
 */

import { Pool } from 'pg';
import logger from './logger';
import { YieldComparisonEngine, ProtocolYieldData } from './yieldComparison';

// ── Configuration ─────────────────────────────────────────────────────────────

export interface YieldCheckConfig {
  /** How often to run the yield check (default: 3_600_000 ms = 1 hour). */
  intervalMs: number;
  /** Slippage tolerance in basis points for min_out calculation (default: 50 = 0.5%). */
  slippageBps: number;
  /** Minimum APY improvement to trigger rebalance (default: 0.005 = 0.5%). */
  minImprovementThreshold: number;
  /** Vault contract ID on Stellar. */
  vaultContractId: string;
  /** Agent keypair secret key for signing rebalance transactions. */
  agentSecret: string;
  /** Soroban RPC URL. */
  rpcUrl: string;
  /** Stellar network passphrase. */
  networkPassphrase: string;
}

export const DEFAULT_YIELD_CHECK_CONFIG: YieldCheckConfig = {
  intervalMs: parseInt(process.env.YIELD_CHECK_INTERVAL_MS ?? '3600000', 10),
  slippageBps: parseInt(process.env.YIELD_CHECK_SLIPPAGE_BPS ?? '50', 10),
  minImprovementThreshold: parseFloat(process.env.YIELD_CHECK_MIN_IMPROVEMENT ?? '0.005'),
  vaultContractId: process.env.VAULT_CONTRACT_ID ?? '',
  agentSecret: process.env.AGENT_SECRET_KEY ?? '',
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.SOROBAN_NETWORK_PASSPHRASE ??
    'Test SDF Network ; September 2015',
};

// ── Result types ───────────────────────────────────────────────────────────────

export interface ProtocolApySnapshot {
  protocolId: string;
  name: string;
  apy: number;
  tvlUsdc: number;
  fetchedAt: number;
}

export interface YieldCheckResult {
  jobId: string;
  checkedAt: number;
  currentProtocol: string;
  currentApy: number;
  bestProtocol: string;
  bestApy: number;
  rebalanceTriggered: boolean;
  /** Why rebalance was skipped, when applicable. */
  skipReason?: string;
  txHash?: string;
  minOut?: number;
  deployedAmount?: number;
  cooldownLedgersRemaining?: number;
  error?: string;
}

// ── Injectable hooks (for testability) ────────────────────────────────────────

/** Fetches live yield data from a protocol. */
export type ApyFetcher = (protocolId: string) => Promise<ProtocolYieldData>;

/** Returns the currently-active protocol ID and the deployed USDC amount (stroops). */
export type CurrentProtocolFetcher = () => Promise<{
  protocolId: string;
  deployedAmountStroops: number;
}>;

/** Reads cooldown constraints from the vault contract. */
export type CooldownChecker = () => Promise<{
  cooldownLedgers: number;
  lastRebalanceLedger: number;
  currentLedger: number;
}>;

/** Submits a rebalance transaction; returns the transaction hash. */
export type RebalanceSubmitter = (
  protocol: string,
  expectedApy: number,
  minOut: number,
) => Promise<{ txHash: string }>;

export interface YieldCheckHooks {
  apyFetchers: Record<string, ApyFetcher>;
  getCurrentProtocol: CurrentProtocolFetcher;
  checkCooldown: CooldownChecker;
  submitRebalance: RebalanceSubmitter;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

// ── Database helpers ───────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS yield_check_history (
    id             BIGSERIAL PRIMARY KEY,
    job_id         TEXT        NOT NULL,
    checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_protocol TEXT      NOT NULL,
    current_apy    NUMERIC(10,6) NOT NULL,
    best_protocol  TEXT        NOT NULL,
    best_apy       NUMERIC(10,6) NOT NULL,
    rebalance_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    skip_reason    TEXT,
    tx_hash        TEXT,
    min_out        BIGINT,
    deployed_amount BIGINT,
    cooldown_remaining INTEGER,
    error          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function ensureTable(pool: Pool): Promise<void> {
  await pool.query(CREATE_TABLE_SQL);
}

async function storeResult(pool: Pool, result: YieldCheckResult): Promise<void> {
  const sql = `
    INSERT INTO yield_check_history (
      job_id, checked_at, current_protocol, current_apy, best_protocol, best_apy,
      rebalance_triggered, skip_reason, tx_hash, min_out, deployed_amount,
      cooldown_remaining, error
    ) VALUES (
      $1, to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
  `;
  await pool.query(sql, [
    result.jobId,
    result.checkedAt,
    result.currentProtocol,
    result.currentApy,
    result.bestProtocol,
    result.bestApy,
    result.rebalanceTriggered,
    result.skipReason ?? null,
    result.txHash ?? null,
    result.minOut ?? null,
    result.deployedAmount ?? null,
    result.cooldownLedgersRemaining ?? null,
    result.error ?? null,
  ]);
}

// ── YieldCheckJob ──────────────────────────────────────────────────────────────

/**
 * Bull-style queue job for the hourly yield comparison and rebalance trigger.
 *
 * Usage:
 * ```ts
 * const job = new YieldCheckJob(config, hooks, pool);
 * await job.ensureSchema();
 * job.start();  // begins the 60-minute loop
 * // ...
 * job.stop();
 * ```
 */
export class YieldCheckJob {
  private readonly engine: YieldComparisonEngine;
  private timer: ReturnType<typeof setInterval> | null = null;
  private jobCounter = 0;
  private running = false;

  constructor(
    private readonly config: YieldCheckConfig,
    private readonly hooks: YieldCheckHooks,
    private readonly pool: Pool,
  ) {
    this.engine = new YieldComparisonEngine(
      config.minImprovementThreshold,
      /* riskFreeRate */ 0.04,
    );
  }

  /** Call once at startup to ensure the analytics table exists. */
  async ensureSchema(): Promise<void> {
    try {
      await ensureTable(this.pool);
      logger.info('yield_check_history table ready');
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : err },
        'Failed to create yield_check_history table — results will not be persisted',
      );
    }
  }

  /** Enqueue a single yield-check run immediately (used for on-demand checks). */
  async runOnce(): Promise<YieldCheckResult> {
    const jobId = `yield-check-${++this.jobCounter}-${Date.now()}`;
    const checkedAt = this.now();

    logger.info({ jobId }, 'Yield check job started');

    let result: YieldCheckResult;
    try {
      result = await this.execute(jobId, checkedAt);
    } catch (err) {
      result = {
        jobId,
        checkedAt,
        currentProtocol: 'unknown',
        currentApy: 0,
        bestProtocol: 'unknown',
        bestApy: 0,
        rebalanceTriggered: false,
        error: err instanceof Error ? err.message : String(err),
      };
      logger.error({ jobId, error: result.error }, 'Yield check job threw unexpectedly');
    }

    // Persist regardless of outcome
    try {
      await storeResult(this.pool, result);
    } catch (err) {
      logger.warn(
        { jobId, error: err instanceof Error ? err.message : err },
        'Failed to persist yield check result',
      );
    }

    return result;
  }

  /** Start the hourly wall-clock loop. Idempotent. */
  start(): void {
    if (this.timer) return;

    logger.info(
      { intervalMs: this.config.intervalMs },
      'Yield check queue started — running every hour',
    );

    // Run immediately on start, then on the interval
    void this.runOnce();

    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.config.intervalMs);
  }

  /** Stop the hourly loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Yield check queue stopped');
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  // ── Core execution ────────────────────────────────────────────────────────

  private async execute(jobId: string, checkedAt: number): Promise<YieldCheckResult> {
    // 1. Fetch current protocol and deployed amount
    const { protocolId: currentProtocol, deployedAmountStroops } =
      await this.hooks.getCurrentProtocol();

    logger.info(
      { jobId, currentProtocol, deployedAmountStroops },
      'Fetched current protocol state',
    );

    // 2. Check rebalance cooldown before doing expensive APY fetches
    const cooldown = await this.hooks.checkCooldown();
    const { cooldownLedgers, lastRebalanceLedger, currentLedger } = cooldown;

    const ledgersSinceRebalance = currentLedger - lastRebalanceLedger;
    if (cooldownLedgers > 0 && ledgersSinceRebalance < cooldownLedgers) {
      const remaining = cooldownLedgers - ledgersSinceRebalance;
      logger.info(
        { jobId, remaining, cooldownLedgers, ledgersSinceRebalance },
        'Rebalance cooldown active — skipping',
      );

      // Still need current APY for the log record; use a best-effort fetch
      const currentApyData = await this.fetchApySafe(currentProtocol);

      return {
        jobId,
        checkedAt,
        currentProtocol,
        currentApy: currentApyData?.currentApy ?? 0,
        bestProtocol: currentProtocol,
        bestApy: currentApyData?.currentApy ?? 0,
        rebalanceTriggered: false,
        skipReason: `cooldown_active: ${remaining} ledgers remaining`,
        cooldownLedgersRemaining: remaining,
        deployedAmount: deployedAmountStroops,
      };
    }

    // 3. Fetch APY from all registered protocol adapters
    const protocolIds = Object.keys(this.hooks.apyFetchers);
    const yieldSnapshots = await this.fetchAllApys(jobId, protocolIds);

    if (yieldSnapshots.length === 0) {
      return {
        jobId,
        checkedAt,
        currentProtocol,
        currentApy: 0,
        bestProtocol: currentProtocol,
        bestApy: 0,
        rebalanceTriggered: false,
        skipReason: 'no_apy_data_available',
        deployedAmount: deployedAmountStroops,
      };
    }

    // 4. Determine current APY and best available opportunity
    const currentSnapshot = yieldSnapshots.find((s) => s.protocolId === currentProtocol);
    const currentApy = currentSnapshot?.currentApy ?? 0;

    const ranked = this.engine.rankOpportunities(yieldSnapshots);
    const best = ranked[0];
    const bestApy = best?.netApy ?? 0;
    const bestProtocol = best?.protocolId ?? currentProtocol;

    logger.info(
      {
        jobId,
        currentProtocol,
        currentApy: (currentApy * 100).toFixed(2) + '%',
        bestProtocol,
        bestApy: (bestApy * 100).toFixed(2) + '%',
        improvement: ((bestApy - currentApy) * 100).toFixed(2) + '%',
      },
      'Yield comparison complete',
    );

    // 5. Decide whether to rebalance (threshold: improvement > 0.5%)
    const shouldRebalance =
      bestProtocol !== currentProtocol &&
      this.engine.shouldRebalance(currentApy, bestApy);

    if (!shouldRebalance) {
      const reason =
        bestProtocol === currentProtocol
          ? 'already_on_best_protocol'
          : `improvement_below_threshold: ${((bestApy - currentApy) * 100).toFixed(3)}% < ${(this.config.minImprovementThreshold * 100).toFixed(1)}%`;

      logger.info({ jobId, reason }, 'No rebalance needed');

      return {
        jobId,
        checkedAt,
        currentProtocol,
        currentApy,
        bestProtocol,
        bestApy,
        rebalanceTriggered: false,
        skipReason: reason,
        deployedAmount: deployedAmountStroops,
      };
    }

    // 6. Calculate min_out = deployedAmount × (1 − slippageBps / 10_000)
    const minOut = Math.floor(
      deployedAmountStroops * (1 - this.config.slippageBps / 10_000),
    );

    logger.info(
      {
        jobId,
        targetProtocol: bestProtocol,
        expectedApy: bestApy,
        minOut,
        deployedAmountStroops,
        slippageBps: this.config.slippageBps,
      },
      'Triggering rebalance',
    );

    // 7. Submit rebalance transaction
    try {
      const { txHash } = await this.hooks.submitRebalance(
        bestProtocol,
        bestApy,
        minOut,
      );

      logger.info(
        {
          jobId,
          txHash,
          fromProtocol: currentProtocol,
          toProtocol: bestProtocol,
          currentApy: (currentApy * 100).toFixed(2) + '%',
          expectedApy: (bestApy * 100).toFixed(2) + '%',
          minOut,
          reason: `APY improvement of ${((bestApy - currentApy) * 100).toFixed(3)}% exceeds threshold`,
        },
        'Rebalance submitted successfully',
      );

      return {
        jobId,
        checkedAt,
        currentProtocol,
        currentApy,
        bestProtocol,
        bestApy,
        rebalanceTriggered: true,
        txHash,
        minOut,
        deployedAmount: deployedAmountStroops,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ jobId, error, targetProtocol: bestProtocol }, 'Rebalance submission failed');

      return {
        jobId,
        checkedAt,
        currentProtocol,
        currentApy,
        bestProtocol,
        bestApy,
        rebalanceTriggered: false,
        skipReason: 'rebalance_submission_failed',
        error,
        minOut,
        deployedAmount: deployedAmountStroops,
      };
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async fetchAllApys(
    jobId: string,
    protocolIds: string[],
  ): Promise<ProtocolYieldData[]> {
    const results: ProtocolYieldData[] = [];

    await Promise.allSettled(
      protocolIds.map(async (id) => {
        try {
          const data = await this.hooks.apyFetchers[id](id);
          results.push(data);
          logger.debug(
            { jobId, protocolId: id, apy: (data.currentApy * 100).toFixed(2) + '%' },
            'APY fetched',
          );
        } catch (err) {
          logger.warn(
            { jobId, protocolId: id, error: err instanceof Error ? err.message : err },
            'Failed to fetch APY for protocol — skipping',
          );
        }
      }),
    );

    return results;
  }

  private async fetchApySafe(protocolId: string): Promise<ProtocolYieldData | null> {
    const fetcher = this.hooks.apyFetchers[protocolId];
    if (!fetcher) return null;
    try {
      return await fetcher(protocolId);
    } catch {
      return null;
    }
  }

  private now(): number {
    return this.hooks.now ? this.hooks.now() : Date.now();
  }
}

// ── Production factory ─────────────────────────────────────────────────────────

/**
 * Builds a production-ready YieldCheckJob wired to the Soroban vault contract.
 *
 * Requires environment variables:
 *   VAULT_CONTRACT_ID, AGENT_SECRET_KEY, SOROBAN_RPC_URL,
 *   SOROBAN_NETWORK_PASSPHRASE, DATABASE_URL
 */
export function createProductionYieldCheckJob(pool: Pool): YieldCheckJob {
  // Dynamic import to avoid breaking unit tests that don't have @stellar/stellar-sdk
  // configured with real network credentials.
  const config = { ...DEFAULT_YIELD_CHECK_CONFIG };

  const hooks: YieldCheckHooks = {
    /**
     * APY fetchers for each supported protocol.
     * In production these call the on-chain adapter contracts via Soroban RPC.
     * The mock implementations below return plausible values and should be
     * replaced with real contract invocations once adapter contracts are deployed.
     */
    apyFetchers: {
      blend: async (_id: string): Promise<ProtocolYieldData> => {
        // TODO: replace with real Blend contract call
        // const server = new SorobanRpc.Server(config.rpcUrl);
        // const result = await server.simulateTransaction(...);
        logger.debug('Fetching Blend APY via protocol adapter');
        return {
          protocolId: 'blend',
          name: 'Blend Protocol',
          type: 'blend',
          currentApy: parseFloat(process.env.BLEND_MOCK_APY ?? '0.065'),
          historicalApy7d: 0.064,
          historicalApy30d: 0.063,
          tvlUsdc: 5_000_000,
          volatility: 0.01,
          riskScore: 25,
        };
      },
      dex: async (_id: string): Promise<ProtocolYieldData> => {
        // TODO: replace with real Stellar DEX pool APY calculation
        logger.debug('Fetching DEX pool APY via protocol adapter');
        return {
          protocolId: 'dex',
          name: 'Stellar DEX LP',
          type: 'dex_lp',
          currentApy: parseFloat(process.env.DEX_MOCK_APY ?? '0.085'),
          historicalApy7d: 0.082,
          historicalApy30d: 0.079,
          tvlUsdc: 2_000_000,
          volatility: 0.04,
          riskScore: 55,
        };
      },
    },

    getCurrentProtocol: async () => {
      // TODO: replace with real contract call: get_asset_breakdown() + current_protocol()
      const deployed = parseInt(process.env.MOCK_DEPLOYED_AMOUNT ?? '100000000', 10);
      return {
        protocolId: process.env.CURRENT_PROTOCOL ?? 'blend',
        deployedAmountStroops: deployed,
      };
    },

    checkCooldown: async () => {
      // TODO: replace with real Soroban RPC calls:
      //   get_rebalance_cooldown(), get_last_rebalance_ledger()
      //   SorobanRpc.Server.getLatestLedger()
      return {
        cooldownLedgers: parseInt(process.env.MOCK_COOLDOWN_LEDGERS ?? '720', 10),
        lastRebalanceLedger: parseInt(process.env.MOCK_LAST_REBALANCE_LEDGER ?? '0', 10),
        currentLedger: parseInt(process.env.MOCK_CURRENT_LEDGER ?? '9999', 10),
      };
    },

    submitRebalance: async (
      protocol: string,
      expectedApy: number,
      minOut: number,
    ): Promise<{ txHash: string }> => {
      if (!config.agentSecret) {
        throw new Error(
          'AGENT_SECRET_KEY not set — cannot submit rebalance transaction',
        );
      }

      // Build and submit the Soroban transaction via @stellar/stellar-sdk
      const StellarSdk = await import('@stellar/stellar-sdk');
      const keypair = StellarSdk.Keypair.fromSecret(config.agentSecret);
      const server = new StellarSdk.SorobanRpc.Server(config.rpcUrl);

      logger.info(
        { protocol, expectedApy, minOut, agent: keypair.publicKey().slice(0, 8) + '...' },
        'Submitting rebalance transaction',
      );

      // Build the contract call
      const contract = new StellarSdk.Contract(config.vaultContractId);

      const account = await server.getAccount(keypair.publicKey());
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'rebalance',
            StellarSdk.nativeToScVal(protocol, { type: 'symbol' }),
            StellarSdk.nativeToScVal(Math.round(expectedApy * 10_000_000), { type: 'i128' }),
            StellarSdk.nativeToScVal(minOut, { type: 'i128' }),
          ),
        )
        .setTimeout(30)
        .build();

      const prepared = await server.prepareTransaction(transaction);
      prepared.sign(keypair);

      const response = await server.sendTransaction(prepared);

      if (response.status === 'ERROR') {
        throw new Error(`Rebalance transaction rejected: ${JSON.stringify(response.errorResult)}`);
      }

      // Poll for confirmation (up to 30s)
      let txHash = response.hash;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const tx = await server.getTransaction(txHash);
          if (tx.status === 'SUCCESS') break;
          if (tx.status === 'FAILED') {
            throw new Error(`Rebalance transaction failed on-chain: ${txHash}`);
          }
        } catch (e) {
          if (i === 29) throw e;
        }
      }

      return { txHash };
    },
  };

  return new YieldCheckJob(config, hooks, pool);
}
