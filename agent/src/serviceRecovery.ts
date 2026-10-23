/**
 * Full service recovery coordinator and staging rehearsal engine (Issue #527).
 *
 * Orchestrates controlled recovery after a simultaneous Redis queue and
 * PostgreSQL/Supabase database interruption, covering:
 *  1. Queued transactions: deduplicating pending/in-flight Redis jobs against
 *     committed database records and confirmed Soroban on-chain transactions
 *     so recovered workers NEVER duplicate financial actions.
 *  2. Event checkpoints: restoring the last processed ledger checkpoint from
 *     persistent state (`StateBackupManager` / `agent_state` / `vault_events`)
 *     and backfilling missed Soroban contract events across the outage window.
 *  3. Chain reconciliation & data-gap gating: verifying on-chain vault totals
 *     (`total_assets`, `total_shares` in 7-decimal USDC stroops) and ledger
 *     continuity against off-chain indexed state. Any unresolved data gap
 *     blocks declaring recovery complete and keeps financial execution paused.
 *  4. Worker restart & measured recovery timing: recording per-phase and end-to-end
 *     recovery durations against the 5-minute RTO target (300,000 ms).
 */

import { createHash } from 'node:crypto';
import logger from './logger';
import { StateBackupManager } from './stateBackup';

/**
 * 1 USDC = 10^7 stroops on Stellar/Soroban (matches on-chain `i128` base units
 * and PostgreSQL `NUMERIC(30, 7)` storage).
 */
export const STROOPS_PER_USDC = 10_000_000;

/** Default Recovery Time Objective (RTO) budget: 5 minutes (300,000 ms). */
export const DEFAULT_RTO_BUDGET_MS = 300_000;

/** Canonical Stellar network passphrases for network identity verification. */
export const STELLAR_NETWORK_PASSPHRASES = {
  testnet: 'Test SDF Network ; September 2015',
  mainnet: 'Public Global Stellar Network ; Stellar Development Foundation',
} as const;

export type FinancialActionKind = 'deposit' | 'withdraw' | 'rebalance' | 'harvest';
export type AuthorizationRole = 'user' | 'agent' | 'owner';

/**
 * Explicit contract authorization matrix for financial actions:
 * - `deposit` / `withdraw`: requires `user.require_auth()`
 * - `rebalance` / `harvest`: requires `agent.require_auth()`
 */
export const REQUIRED_AUTH_BY_ACTION: Readonly<Record<FinancialActionKind, AuthorizationRole>> = {
  deposit: 'user',
  withdraw: 'user',
  rebalance: 'agent',
  harvest: 'agent',
};

export type QueuedTransactionStatus =
  | 'queued'
  | 'in_flight'
  | 'confirmed'
  | 'skipped_duplicate'
  | 'blocked';

/**
 * A financial transaction tracked in the Redis worker queue.
 * All monetary amounts are expressed in integer stroops (7-decimal precision).
 */
export interface QueuedFinancialTransaction {
  jobId: string;
  idempotencyKey: string;
  action: FinancialActionKind;
  /** Monetary amount in 7-decimal USDC stroops (`10_000_000` = 1.0000000 USDC). */
  amountStroops: number;
  assetSymbol: 'USDC';
  /** Stellar network passphrase identifying the target chain. */
  networkPassphrase: string;
  /** Target Soroban vault contract ID (`C...`). */
  contractId: string;
  /** Stellar address (`G...`) authorizing the call. */
  authorizedActor: string;
  /** Contract authorization boundary role (`user`, `agent`, or `owner`). */
  requiredRole: AuthorizationRole;
  /** Ledger checkpoint at the time the job was enqueued. */
  ledgerCheckpoint: number;
  enqueuedAt: number;
  status: QueuedTransactionStatus;
  txHash?: string;
}

/** Normalized Soroban vault event used for checkpoint backfill and reconciliation. */
export interface ChainVaultEvent {
  eventId: string;
  eventType: 'deposit' | 'withdraw' | 'rebalance' | 'harvest';
  ledgerSequence: number;
  txHash: string;
  idempotencyKey?: string;
  actor: string;
  /** Asset delta in 7-decimal USDC stroops. */
  amountStroops: number;
  /** Share delta in 7-decimal share stroops. */
  sharesStroops: number;
}

/** Unresolved data or state discrepancy that blocks declaring recovery complete. */
export interface DataGap {
  kind:
    | 'missing_ledger_events'
    | 'accounting_mismatch'
    | 'ambiguous_inflight_tx'
    | 'network_mismatch'
    | 'authorization_violation'
    | 'checkpoint_regression';
  severity: 'critical' | 'high';
  description: string;
  details: Record<string, unknown>;
}

/** Phase-by-phase and total recovery timing measurements (in milliseconds). */
export interface RecoveryTimingMetrics {
  outageDetectedAtMs: number;
  recoveryStartedAtMs: number;
  recoveryFinishedAtMs: number;
  redisReconnectDurationMs: number;
  dbReconnectDurationMs: number;
  checkpointRestoreDurationMs: number;
  eventBackfillDurationMs: number;
  queueDeduplicationDurationMs: number;
  chainReconciliationDurationMs: number;
  workerRestartDurationMs: number;
  totalRecoveryDurationMs: number;
  rtoBudgetMs: number;
  withinRtoBudget: boolean;
}

/** Complete evidence record produced by a service recovery run or staging rehearsal. */
export interface RecoveryExerciseReport {
  status: 'recovered' | 'blocked_by_data_gaps';
  recoveryComplete: boolean;
  workerResumed: boolean;
  networkPassphrase: string;
  contractId: string;
  monetaryUnit: 'stroops (7 decimals, 1 USDC = 10,000,000 stroops)';
  checkpoint: {
    previousLedger: number;
    chainLatestLedger: number;
    reconciledLedger: number;
    backfilledEventCount: number;
  };
  queueSummary: {
    totalInspected: number;
    duplicateActionsPrevented: string[];
    executedActions: Array<{ jobId: string; idempotencyKey: string; txHash: string; amountStroops: number }>;
    blockedActions: string[];
  };
  accounting: {
    onChainTotalAssetsStroops: number;
    dbTotalAssetsStroops: number;
    onChainTotalSharesStroops: number;
    dbTotalSharesStroops: number;
    assetsDeltaStroops: number;
    sharesDeltaStroops: number;
  };
  unresolvedGaps: DataGap[];
  timing: RecoveryTimingMetrics;
}

/** Adapter interface for the Redis transaction queue and idempotency store. */
export interface RedisQueueAdapter {
  ping(): Promise<boolean>;
  getPendingJobs(): Promise<QueuedFinancialTransaction[]>;
  getProcessedIdempotencyKeys(): Promise<Set<string>>;
  markJobStatus(jobId: string, status: QueuedTransactionStatus, txHash?: string): Promise<void>;
  recordIdempotencyKey(idempotencyKey: string, txHash: string): Promise<void>;
}

/** Adapter interface for PostgreSQL/Supabase recovery queries. */
export interface DatabaseRecoveryAdapter {
  ping(): Promise<boolean>;
  getCheckpointLedger(): Promise<number | null>;
  saveCheckpointLedger(ledger: number): Promise<void>;
  insertIndexedEvent(event: ChainVaultEvent): Promise<boolean>;
  getRecordedIdempotencyKeys(): Promise<Set<string>>;
  getRecordedTxHashes(): Promise<Set<string>>;
  recordExecutedTransaction(tx: QueuedFinancialTransaction, txHash: string): Promise<void>;
  getAccountingTotals(): Promise<{ totalAssetsStroops: number; totalSharesStroops: number }>;
}

/** Adapter interface for Soroban RPC chain queries during reconciliation. */
export interface ChainRpcRecoveryAdapter {
  getNetworkPassphrase(): Promise<string>;
  getLatestLedger(): Promise<number>;
  getVaultEvents(
    startLedger: number,
    endLedger: number,
  ): Promise<{ events: ChainVaultEvent[]; missingLedgers: number[] }>;
  getOnChainVaultTotals(): Promise<{
    totalAssetsStroops: number;
    totalSharesStroops: number;
    paused: boolean;
  }>;
  getConfirmedTransactionsByIdempotencyKey(): Promise<Map<string, string>>;
}

export interface RecoveryOrchestratorConfig {
  expectedNetworkPassphrase: string;
  contractId: string;
  rtoBudgetMs?: number;
  outageDetectedAtMs?: number;
}

export interface RecoveryOrchestratorDeps {
  redis: RedisQueueAdapter;
  db: DatabaseRecoveryAdapter;
  chain: ChainRpcRecoveryAdapter;
  stateBackup?: StateBackupManager;
  executeFinancialAction: (tx: QueuedFinancialTransaction) => Promise<{ txHash: string }>;
  onWorkerResume?: (reconciledLedger: number) => Promise<void> | void;
  now?: () => number;
}

/**
 * Computes a deterministic SHA-256 idempotency key for a financial action,
 * binding network identity, contract ID, action type, authorized actor,
 * amount in stroops, and ledger checkpoint.
 */
export function computeIdempotencyKey(
  input: Pick<
    QueuedFinancialTransaction,
    'networkPassphrase' | 'contractId' | 'action' | 'authorizedActor' | 'amountStroops' | 'ledgerCheckpoint'
  >,
): string {
  const payload = [
    input.networkPassphrase,
    input.contractId,
    input.action,
    input.authorizedActor,
    String(input.amountStroops),
    String(input.ledgerCheckpoint),
  ].join(':');
  return `idem_${createHash('sha256').update(payload).digest('hex').slice(0, 32)}`;
}

/**
 * Validates that a queued financial transaction preserves monetary unit integrity,
 * network identity, and contract authorization rules.
 */
export function validateQueuedTransaction(
  tx: QueuedFinancialTransaction,
  expectedNetworkPassphrase: string,
  expectedContractId: string,
): DataGap | null {
  if (tx.networkPassphrase !== expectedNetworkPassphrase) {
    return {
      kind: 'network_mismatch',
      severity: 'critical',
      description: `Queued job ${tx.jobId} targets network '${tx.networkPassphrase}', expected '${expectedNetworkPassphrase}'`,
      details: { jobId: tx.jobId, found: tx.networkPassphrase, expected: expectedNetworkPassphrase },
    };
  }

  if (tx.contractId !== expectedContractId) {
    return {
      kind: 'network_mismatch',
      severity: 'critical',
      description: `Queued job ${tx.jobId} targets contract '${tx.contractId}', expected '${expectedContractId}'`,
      details: { jobId: tx.jobId, found: tx.contractId, expected: expectedContractId },
    };
  }

  const expectedRole = REQUIRED_AUTH_BY_ACTION[tx.action];
  if (tx.requiredRole !== expectedRole || !tx.authorizedActor) {
    return {
      kind: 'authorization_violation',
      severity: 'critical',
      description: `Queued job ${tx.jobId} (${tx.action}) requires role '${expectedRole}', found '${tx.requiredRole}'`,
      details: {
        jobId: tx.jobId,
        action: tx.action,
        expectedRole,
        foundRole: tx.requiredRole,
        authorizedActor: tx.authorizedActor,
      },
    };
  }

  if (
    tx.assetSymbol !== 'USDC' ||
    !Number.isSafeInteger(tx.amountStroops) ||
    tx.amountStroops < 0 ||
    (tx.action !== 'harvest' && tx.amountStroops <= 0)
  ) {
    return {
      kind: 'accounting_mismatch',
      severity: 'critical',
      description: `Queued job ${tx.jobId} has invalid monetary unit or amountStroops (${tx.amountStroops})`,
      details: { jobId: tx.jobId, amountStroops: tx.amountStroops, assetSymbol: tx.assetSymbol },
    };
  }

  return null;
}

/**
 * Coordinates full service recovery after a Redis and database interruption.
 */
export class ServiceRecoveryOrchestrator {
  private readonly rtoBudgetMs: number;

  constructor(
    private readonly config: RecoveryOrchestratorConfig,
    private readonly deps: RecoveryOrchestratorDeps,
  ) {
    this.rtoBudgetMs = config.rtoBudgetMs ?? DEFAULT_RTO_BUDGET_MS;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /**
   * Executes the recovery sequence:
   *  1. Reconnect to Redis & PostgreSQL and verify chain network passphrase.
   *  2. Restore last ledger checkpoint and backfill missed Soroban events.
   *  3. Deduplicate queued financial transactions against Redis, DB, and chain.
   *  4. Reconcile on-chain vs DB accounting totals and check for unresolved data gaps.
   *  5. If and only if zero unresolved data gaps remain, execute remaining valid
   *     queued actions once, advance checkpoint, and resume worker loops.
   */
  async runRecovery(): Promise<RecoveryExerciseReport> {
    const recoveryStartedAtMs = this.now();
    const outageDetectedAtMs = this.config.outageDetectedAtMs ?? recoveryStartedAtMs;
    const unresolvedGaps: DataGap[] = [];

    // Phase 1: Redis & Database Reconnect + Network Identity Verification
    const tRedisStart = this.now();
    const redisOk = await this.deps.redis.ping();
    const redisReconnectDurationMs = Math.max(0, this.now() - tRedisStart);
    if (!redisOk) {
      throw new Error('Redis queue remains unreachable; cannot start recovery');
    }

    const tDbStart = this.now();
    const dbOk = await this.deps.db.ping();
    const dbReconnectDurationMs = Math.max(0, this.now() - tDbStart);
    if (!dbOk) {
      throw new Error('PostgreSQL database remains unreachable; cannot start recovery');
    }

    const chainNetworkPassphrase = await this.deps.chain.getNetworkPassphrase();
    if (chainNetworkPassphrase !== this.config.expectedNetworkPassphrase) {
      unresolvedGaps.push({
        kind: 'network_mismatch',
        severity: 'critical',
        description: `RPC network passphrase '${chainNetworkPassphrase}' does not match expected '${this.config.expectedNetworkPassphrase}'`,
        details: {
          found: chainNetworkPassphrase,
          expected: this.config.expectedNetworkPassphrase,
        },
      });
    }

    // Phase 2: Event Checkpoint Restoration & Chain Event Backfill
    const tCheckpointStart = this.now();
    let dbCheckpoint = await this.deps.db.getCheckpointLedger();
    if (dbCheckpoint === null && this.deps.stateBackup) {
      const restored = await this.deps.stateBackup.restore();
      if (restored) {
        dbCheckpoint = restored.lastLedger;
      }
    }
    const previousLedger = dbCheckpoint ?? 0;
    const chainLatestLedger = await this.deps.chain.getLatestLedger();
    const checkpointRestoreDurationMs = Math.max(0, this.now() - tCheckpointStart);

    if (previousLedger > chainLatestLedger) {
      unresolvedGaps.push({
        kind: 'checkpoint_regression',
        severity: 'critical',
        description: `Stored checkpoint ledger (${previousLedger}) is ahead of chain latest ledger (${chainLatestLedger})`,
        details: { previousLedger, chainLatestLedger },
      });
    }

    const tBackfillStart = this.now();
    let backfilledEventCount = 0;
    if (previousLedger > 0 && chainLatestLedger >= previousLedger) {
      const { events, missingLedgers } = await this.deps.chain.getVaultEvents(
        previousLedger + 1,
        chainLatestLedger,
      );

      if (missingLedgers.length > 0) {
        unresolvedGaps.push({
          kind: 'missing_ledger_events',
          severity: 'critical',
          description: `Unable to fetch events for ${missingLedgers.length} ledger(s) during backfill window [${previousLedger + 1}, ${chainLatestLedger}]`,
          details: {
            missingLedgers,
            windowStart: previousLedger + 1,
            windowEnd: chainLatestLedger,
          },
        });
      }

      for (const evt of events) {
        const inserted = await this.deps.db.insertIndexedEvent(evt);
        if (inserted) {
          backfilledEventCount += 1;
        }
      }
    } else if (previousLedger === 0) {
      unresolvedGaps.push({
        kind: 'missing_ledger_events',
        severity: 'critical',
        description: 'No valid event checkpoint found in database or state backup store',
        details: { previousLedger, chainLatestLedger },
      });
    }
    const eventBackfillDurationMs = Math.max(0, this.now() - tBackfillStart);

    // Phase 3: Queued Financial Transaction Deduplication
    const tDedupeStart = this.now();
    const pendingJobs = await this.deps.redis.getPendingJobs();
    const redisProcessedKeys = await this.deps.redis.getProcessedIdempotencyKeys();
    const dbRecordedKeys = await this.deps.db.getRecordedIdempotencyKeys();
    const dbRecordedHashes = await this.deps.db.getRecordedTxHashes();
    const chainConfirmedMap = await this.deps.chain.getConfirmedTransactionsByIdempotencyKey();

    const duplicateActionsPrevented: string[] = [];
    const blockedActions: string[] = [];
    const readyToExecute: QueuedFinancialTransaction[] = [];
    const seenInCurrentBatch = new Set<string>();

    for (const job of pendingJobs) {
      const validationGap = validateQueuedTransaction(
        job,
        this.config.expectedNetworkPassphrase,
        this.config.contractId,
      );
      if (validationGap) {
        unresolvedGaps.push(validationGap);
        blockedActions.push(job.jobId);
        await this.deps.redis.markJobStatus(job.jobId, 'blocked');
        continue;
      }

      const alreadyInRedis = redisProcessedKeys.has(job.idempotencyKey);
      const alreadyInDb =
        dbRecordedKeys.has(job.idempotencyKey) ||
        (job.txHash !== undefined && dbRecordedHashes.has(job.txHash));
      const confirmedOnChainTxHash = chainConfirmedMap.get(job.idempotencyKey);
      const duplicateInBatch = seenInCurrentBatch.has(job.idempotencyKey);

      if (alreadyInRedis || alreadyInDb || confirmedOnChainTxHash || duplicateInBatch) {
        const canonicalHash = confirmedOnChainTxHash ?? job.txHash ?? 'confirmed_prior_to_recovery';
        duplicateActionsPrevented.push(job.jobId);
        await this.deps.redis.markJobStatus(job.jobId, 'skipped_duplicate', canonicalHash);
        await this.deps.redis.recordIdempotencyKey(job.idempotencyKey, canonicalHash);
        if (confirmedOnChainTxHash && !alreadyInDb) {
          await this.deps.db.recordExecutedTransaction(job, confirmedOnChainTxHash);
        }
        logger.info(
          {
            jobId: job.jobId,
            idempotencyKey: job.idempotencyKey,
            action: job.action,
            amountStroops: job.amountStroops,
          },
          'Prevented duplicate financial action during service recovery',
        );
        continue;
      }

      if (job.status === 'in_flight') {
        // Job was marked in-flight before the Redis/DB outage, but could not be confirmed
        // on-chain or in DB. Block recovery until operator or chain finality resolves it.
        unresolvedGaps.push({
          kind: 'ambiguous_inflight_tx',
          severity: 'high',
          description: `In-flight financial transaction ${job.jobId} (${job.action}, ${job.amountStroops} stroops) has unverified on-chain finality`,
          details: {
            jobId: job.jobId,
            idempotencyKey: job.idempotencyKey,
            action: job.action,
            amountStroops: job.amountStroops,
          },
        });
        blockedActions.push(job.jobId);
        await this.deps.redis.markJobStatus(job.jobId, 'blocked');
        continue;
      }

      seenInCurrentBatch.add(job.idempotencyKey);
      readyToExecute.push(job);
    }
    const queueDeduplicationDurationMs = Math.max(0, this.now() - tDedupeStart);

    // Phase 4: Chain Accounting Reconciliation
    const tReconcileStart = this.now();
    const onChainTotals = await this.deps.chain.getOnChainVaultTotals();
    const dbTotals = await this.deps.db.getAccountingTotals();
    const assetsDeltaStroops = onChainTotals.totalAssetsStroops - dbTotals.totalAssetsStroops;
    const sharesDeltaStroops = onChainTotals.totalSharesStroops - dbTotals.totalSharesStroops;

    if (assetsDeltaStroops !== 0 || sharesDeltaStroops !== 0) {
      unresolvedGaps.push({
        kind: 'accounting_mismatch',
        severity: 'critical',
        description: `Unreconciled accounting gap after event backfill: assets delta=${assetsDeltaStroops} stroops, shares delta=${sharesDeltaStroops} stroops`,
        details: {
          onChainTotalAssetsStroops: onChainTotals.totalAssetsStroops,
          dbTotalAssetsStroops: dbTotals.totalAssetsStroops,
          onChainTotalSharesStroops: onChainTotals.totalSharesStroops,
          dbTotalSharesStroops: dbTotals.totalSharesStroops,
          assetsDeltaStroops,
          sharesDeltaStroops,
        },
      });
    }
    const chainReconciliationDurationMs = Math.max(0, this.now() - tReconcileStart);

    // Phase 5: Gate Check & Worker Restart
    const tWorkerStart = this.now();
    const executedActions: Array<{
      jobId: string;
      idempotencyKey: string;
      txHash: string;
      amountStroops: number;
    }> = [];

    if (unresolvedGaps.length > 0) {
      for (const job of readyToExecute) {
        blockedActions.push(job.jobId);
        await this.deps.redis.markJobStatus(job.jobId, 'blocked');
      }
      const recoveryFinishedAtMs = this.now();
      const workerRestartDurationMs = Math.max(0, recoveryFinishedAtMs - tWorkerStart);
      const totalRecoveryDurationMs = Math.max(0, recoveryFinishedAtMs - outageDetectedAtMs);

      logger.error(
        { gapCount: unresolvedGaps.length, unresolvedGaps },
        'Service recovery blocked by unresolved data gaps',
      );

      return {
        status: 'blocked_by_data_gaps',
        recoveryComplete: false,
        workerResumed: false,
        networkPassphrase: this.config.expectedNetworkPassphrase,
        contractId: this.config.contractId,
        monetaryUnit: 'stroops (7 decimals, 1 USDC = 10,000,000 stroops)',
        checkpoint: {
          previousLedger,
          chainLatestLedger,
          reconciledLedger: previousLedger,
          backfilledEventCount,
        },
        queueSummary: {
          totalInspected: pendingJobs.length,
          duplicateActionsPrevented,
          executedActions,
          blockedActions,
        },
        accounting: {
          onChainTotalAssetsStroops: onChainTotals.totalAssetsStroops,
          dbTotalAssetsStroops: dbTotals.totalAssetsStroops,
          onChainTotalSharesStroops: onChainTotals.totalSharesStroops,
          dbTotalSharesStroops: dbTotals.totalSharesStroops,
          assetsDeltaStroops,
          sharesDeltaStroops,
        },
        unresolvedGaps,
        timing: {
          outageDetectedAtMs,
          recoveryStartedAtMs,
          recoveryFinishedAtMs,
          redisReconnectDurationMs,
          dbReconnectDurationMs,
          checkpointRestoreDurationMs,
          eventBackfillDurationMs,
          queueDeduplicationDurationMs,
          chainReconciliationDurationMs,
          workerRestartDurationMs,
          totalRecoveryDurationMs,
          rtoBudgetMs: this.rtoBudgetMs,
          withinRtoBudget: totalRecoveryDurationMs <= this.rtoBudgetMs,
        },
      };
    }

    // All data gaps resolved: execute remaining unexecuted queued actions once,
    // persist checkpoint, and resume workers.
    for (const job of readyToExecute) {
      const { txHash } = await this.deps.executeFinancialAction(job);
      await this.deps.redis.recordIdempotencyKey(job.idempotencyKey, txHash);
      await this.deps.redis.markJobStatus(job.jobId, 'confirmed', txHash);
      await this.deps.db.recordExecutedTransaction(job, txHash);
      executedActions.push({
        jobId: job.jobId,
        idempotencyKey: job.idempotencyKey,
        txHash,
        amountStroops: job.amountStroops,
      });
    }

    await this.deps.db.saveCheckpointLedger(chainLatestLedger);
    if (this.deps.stateBackup) {
      const previousState = this.deps.stateBackup.getLastState();
      await this.deps.stateBackup.backup({
        lastLedger: chainLatestLedger,
        lastRebalanceAt: previousState?.lastRebalanceAt ?? null,
        scheduler: previousState?.scheduler ?? {
          interval: '4h',
          lastRunAt: null,
          consecutiveFailures: 0,
        },
        metrics: {
          tvl: onChainTotals.totalAssetsStroops,
          apy: previousState?.metrics.apy ?? 0.07,
          allocations: previousState?.metrics.allocations ?? [],
        },
      });
    }

    if (this.deps.onWorkerResume) {
      await this.deps.onWorkerResume(chainLatestLedger);
    }

    const recoveryFinishedAtMs = this.now();
    const workerRestartDurationMs = Math.max(0, recoveryFinishedAtMs - tWorkerStart);
    const totalRecoveryDurationMs = Math.max(0, recoveryFinishedAtMs - outageDetectedAtMs);

    logger.info(
      {
        reconciledLedger: chainLatestLedger,
        backfilledEventCount,
        duplicateActionsPrevented: duplicateActionsPrevented.length,
        executedActions: executedActions.length,
        totalRecoveryDurationMs,
      },
      'Service recovery completed and reconciled with Soroban chain state',
    );

    return {
      status: 'recovered',
      recoveryComplete: true,
      workerResumed: true,
      networkPassphrase: this.config.expectedNetworkPassphrase,
      contractId: this.config.contractId,
      monetaryUnit: 'stroops (7 decimals, 1 USDC = 10,000,000 stroops)',
      checkpoint: {
        previousLedger,
        chainLatestLedger,
        reconciledLedger: chainLatestLedger,
        backfilledEventCount,
      },
      queueSummary: {
        totalInspected: pendingJobs.length,
        duplicateActionsPrevented,
        executedActions,
        blockedActions,
      },
      accounting: {
        onChainTotalAssetsStroops: onChainTotals.totalAssetsStroops,
        dbTotalAssetsStroops: dbTotals.totalAssetsStroops,
        onChainTotalSharesStroops: onChainTotals.totalSharesStroops,
        dbTotalSharesStroops: dbTotals.totalSharesStroops,
        assetsDeltaStroops,
        sharesDeltaStroops,
      },
      unresolvedGaps,
      timing: {
        outageDetectedAtMs,
        recoveryStartedAtMs,
        recoveryFinishedAtMs,
        redisReconnectDurationMs,
        dbReconnectDurationMs,
        checkpointRestoreDurationMs,
        eventBackfillDurationMs,
        queueDeduplicationDurationMs,
        chainReconciliationDurationMs,
        workerRestartDurationMs,
        totalRecoveryDurationMs,
        rtoBudgetMs: this.rtoBudgetMs,
        withinRtoBudget: totalRecoveryDurationMs <= this.rtoBudgetMs,
      },
    };
  }
}

/**
 * In-memory staging rehearsal harness used by automated tests and
 * `scripts/rehearse-service-recovery.sh` to run deterministic drills
 * without requiring live mainnet credentials.
 */
export interface StagingRehearsalSummary {
  rehearsedAt: string;
  environment: 'staging-testnet-isolated';
  networkPassphrase: string;
  contractId: string;
  scenarios: {
    duplicatePreventionAndBackfill: RecoveryExerciseReport;
    blockedOnUnresolvedDataGap: RecoveryExerciseReport;
    resolvedAfterGapBackfill: RecoveryExerciseReport;
  };
  allCriteriaPassed: boolean;
}

export async function runControlledStagingRehearsal(): Promise<StagingRehearsalSummary> {
  const networkPassphrase = STELLAR_NETWORK_PASSPHRASES.testnet;
  const contractId = 'CBREHEARSAL527VAULTSTAGINGTESTNET00000000000000000000000';
  const userAddress = 'GUSER527STAGINGTESTNET0000000000000000000000000000000000';
  const agentAddress = 'GAGENT527STAGINGTESTNET000000000000000000000000000000000';

  let simulatedClockMs = 1_792_771_200_000;
  const advanceClock = (ms: number) => {
    simulatedClockMs += ms;
    return simulatedClockMs;
  };

  // Build deterministic queued transactions (in 7-decimal USDC stroops):
  // 1) A 250 USDC deposit that already landed on-chain right as Redis/DB dropped
  const jobAlreadyOnChain: QueuedFinancialTransaction = {
    jobId: 'job_deposit_250_usdc',
    idempotencyKey: computeIdempotencyKey({
      networkPassphrase,
      contractId,
      action: 'deposit',
      authorizedActor: userAddress,
      amountStroops: 250 * STROOPS_PER_USDC,
      ledgerCheckpoint: 50_100,
    }),
    action: 'deposit',
    amountStroops: 250 * STROOPS_PER_USDC,
    assetSymbol: 'USDC',
    networkPassphrase,
    contractId,
    authorizedActor: userAddress,
    requiredRole: 'user',
    ledgerCheckpoint: 50_100,
    enqueuedAt: simulatedClockMs - 40_000,
    status: 'in_flight',
  };

  // 2) A 500 USDC rebalance that was already recorded in DB before the crash
  const jobAlreadyInDb: QueuedFinancialTransaction = {
    jobId: 'job_rebalance_500_usdc',
    idempotencyKey: computeIdempotencyKey({
      networkPassphrase,
      contractId,
      action: 'rebalance',
      authorizedActor: agentAddress,
      amountStroops: 500 * STROOPS_PER_USDC,
      ledgerCheckpoint: 50_098,
    }),
    action: 'rebalance',
    amountStroops: 500 * STROOPS_PER_USDC,
    assetSymbol: 'USDC',
    networkPassphrase,
    contractId,
    authorizedActor: agentAddress,
    requiredRole: 'agent',
    ledgerCheckpoint: 50_098,
    enqueuedAt: simulatedClockMs - 45_000,
    status: 'queued',
    txHash: '0xtx_rebalance_500_committed',
  };

  // 3) A fresh 100 USDC rebalance queued in Redis that has NOT yet executed
  const jobFreshQueued: QueuedFinancialTransaction = {
    jobId: 'job_rebalance_100_usdc_pending',
    idempotencyKey: computeIdempotencyKey({
      networkPassphrase,
      contractId,
      action: 'rebalance',
      authorizedActor: agentAddress,
      amountStroops: 100 * STROOPS_PER_USDC,
      ledgerCheckpoint: 50_105,
    }),
    action: 'rebalance',
    amountStroops: 100 * STROOPS_PER_USDC,
    assetSymbol: 'USDC',
    networkPassphrase,
    contractId,
    authorizedActor: agentAddress,
    requiredRole: 'agent',
    ledgerCheckpoint: 50_105,
    enqueuedAt: simulatedClockMs - 30_000,
    status: 'queued',
  };

  // Scenario 1: Full recovery after 18s outage with queued tx deduplication & event backfill
  const indexedEvents = new Map<string, ChainVaultEvent>();
  const recordedIdemKeys = new Set<string>([jobAlreadyInDb.idempotencyKey]);
  const recordedTxHashes = new Set<string>(['0xtx_rebalance_500_committed']);
  const redisProcessedKeys = new Set<string>();
  let dbAssetsStroops = 1_000 * STROOPS_PER_USDC;
  let dbSharesStroops = 1_000 * STROOPS_PER_USDC;
  let checkpointLedger = 50_100;

  const scenario1Jobs: QueuedFinancialTransaction[] = [
    { ...jobAlreadyOnChain },
    { ...jobAlreadyInDb },
    // Duplicate copy of jobAlreadyOnChain in Redis queue
    { ...jobAlreadyOnChain, jobId: 'job_deposit_250_usdc_retry_dup', status: 'queued' },
    { ...jobFreshQueued },
  ];

  const missedOnChainEvents: ChainVaultEvent[] = [
    {
      eventId: 'evt_50102_deposit_250',
      eventType: 'deposit',
      ledgerSequence: 50_102,
      txHash: '0xtx_deposit_250_onchain',
      idempotencyKey: jobAlreadyOnChain.idempotencyKey,
      actor: userAddress,
      amountStroops: 250 * STROOPS_PER_USDC,
      sharesStroops: 250 * STROOPS_PER_USDC,
    },
  ];

  const outageDetectedAt1 = simulatedClockMs;
  advanceClock(12_400); // Outage lasts 12.4s before recovery starts

  const orchestrator1 = new ServiceRecoveryOrchestrator(
    {
      expectedNetworkPassphrase: networkPassphrase,
      contractId,
      rtoBudgetMs: DEFAULT_RTO_BUDGET_MS,
      outageDetectedAtMs: outageDetectedAt1,
    },
    {
      now: () => simulatedClockMs,
      redis: {
        ping: async () => {
          advanceClock(180);
          return true;
        },
        getPendingJobs: async () => scenario1Jobs,
        getProcessedIdempotencyKeys: async () => redisProcessedKeys,
        markJobStatus: async (jobId, status, txHash) => {
          const found = scenario1Jobs.find((j) => j.jobId === jobId);
          if (found) {
            found.status = status;
            if (txHash) found.txHash = txHash;
          }
        },
        recordIdempotencyKey: async (key) => {
          redisProcessedKeys.add(key);
        },
      },
      db: {
        ping: async () => {
          advanceClock(240);
          return true;
        },
        getCheckpointLedger: async () => {
          advanceClock(95);
          return checkpointLedger;
        },
        saveCheckpointLedger: async (ledger) => {
          checkpointLedger = ledger;
        },
        insertIndexedEvent: async (evt) => {
          advanceClock(120);
          if (indexedEvents.has(evt.eventId)) return false;
          indexedEvents.set(evt.eventId, evt);
          if (evt.eventType === 'deposit') {
            dbAssetsStroops += evt.amountStroops;
            dbSharesStroops += evt.sharesStroops;
          }
          return true;
        },
        getRecordedIdempotencyKeys: async () => recordedIdemKeys,
        getRecordedTxHashes: async () => recordedTxHashes,
        recordExecutedTransaction: async (tx, txHash) => {
          recordedIdemKeys.add(tx.idempotencyKey);
          recordedTxHashes.add(txHash);
        },
        getAccountingTotals: async () => {
          advanceClock(110);
          return {
            totalAssetsStroops: dbAssetsStroops,
            totalSharesStroops: dbSharesStroops,
          };
        },
      },
      chain: {
        getNetworkPassphrase: async () => networkPassphrase,
        getLatestLedger: async () => 50_105,
        getVaultEvents: async () => {
          advanceClock(310);
          return { events: missedOnChainEvents, missingLedgers: [] };
        },
        getOnChainVaultTotals: async () => ({
          totalAssetsStroops: 1_250 * STROOPS_PER_USDC,
          totalSharesStroops: 1_250 * STROOPS_PER_USDC,
          paused: false,
        }),
        getConfirmedTransactionsByIdempotencyKey: async () => {
          advanceClock(150);
          return new Map([[jobAlreadyOnChain.idempotencyKey, '0xtx_deposit_250_onchain']]);
        },
      },
      executeFinancialAction: async (tx) => {
        advanceClock(420);
        return { txHash: `0xtx_executed_${tx.jobId}` };
      },
      onWorkerResume: async () => {
        advanceClock(85);
      },
    },
  );

  const report1 = await orchestrator1.runRecovery();

  // Scenario 2: Unresolved data gap (missing ledger 50_108 + 75 USDC accounting mismatch)
  // MUST block declaring recovery complete and MUST block executing pending jobs.
  let gapResolved = false;
  const outageDetectedAt2 = advanceClock(5_000);
  advanceClock(8_200);

  const buildGapScenarioOrchestrator = (outageStartMs: number) =>
    new ServiceRecoveryOrchestrator(
      {
        expectedNetworkPassphrase: networkPassphrase,
        contractId,
        rtoBudgetMs: DEFAULT_RTO_BUDGET_MS,
        outageDetectedAtMs: outageStartMs,
      },
      {
        now: () => simulatedClockMs,
        redis: {
          ping: async () => {
            advanceClock(140);
            return true;
          },
          getPendingJobs: async () => [],
          getProcessedIdempotencyKeys: async () => redisProcessedKeys,
          markJobStatus: async () => {},
          recordIdempotencyKey: async () => {},
        },
        db: {
          ping: async () => {
            advanceClock(190);
            return true;
          },
          getCheckpointLedger: async () => {
            advanceClock(80);
            return checkpointLedger;
          },
          saveCheckpointLedger: async (ledger) => {
            checkpointLedger = ledger;
          },
          insertIndexedEvent: async (evt) => {
            advanceClock(100);
            if (indexedEvents.has(evt.eventId)) return false;
            indexedEvents.set(evt.eventId, evt);
            if (evt.eventType === 'deposit') {
              dbAssetsStroops += evt.amountStroops;
              dbSharesStroops += evt.sharesStroops;
            }
            return true;
          },
          getRecordedIdempotencyKeys: async () => recordedIdemKeys,
          getRecordedTxHashes: async () => recordedTxHashes,
          recordExecutedTransaction: async () => {},
          getAccountingTotals: async () => {
            advanceClock(90);
            return {
              totalAssetsStroops: dbAssetsStroops,
              totalSharesStroops: dbSharesStroops,
            };
          },
        },
        chain: {
          getNetworkPassphrase: async () => networkPassphrase,
          getLatestLedger: async () => 50_110,
          getVaultEvents: async () => {
            advanceClock(260);
            if (!gapResolved) {
              return { events: [], missingLedgers: [50_108] };
            }
            return {
              events: [
                {
                  eventId: 'evt_50108_deposit_75',
                  eventType: 'deposit',
                  ledgerSequence: 50_108,
                  txHash: '0xtx_deposit_75_onchain',
                  actor: userAddress,
                  amountStroops: 75 * STROOPS_PER_USDC,
                  sharesStroops: 75 * STROOPS_PER_USDC,
                },
              ],
              missingLedgers: [],
            };
          },
          getOnChainVaultTotals: async () => ({
            totalAssetsStroops: 1_325 * STROOPS_PER_USDC,
            totalSharesStroops: 1_325 * STROOPS_PER_USDC,
            paused: false,
          }),
          getConfirmedTransactionsByIdempotencyKey: async () => new Map(),
        },
        executeFinancialAction: async (tx) => ({ txHash: `0xtx_${tx.jobId}` }),
        onWorkerResume: async () => {
          advanceClock(70);
        },
      },
    );

  const report2Blocked = await buildGapScenarioOrchestrator(outageDetectedAt2).runRecovery();

  // Scenario 3: Resolve the missing ledger event and re-run reconciliation -> recovery completes
  gapResolved = true;
  const outageDetectedAt3 = advanceClock(2_000);
  advanceClock(3_500);
  const report3Resolved = await buildGapScenarioOrchestrator(outageDetectedAt3).runRecovery();

  const allCriteriaPassed =
    report1.recoveryComplete === true &&
    report1.queueSummary.duplicateActionsPrevented.length === 3 &&
    report1.queueSummary.executedActions.length === 1 &&
    report1.timing.totalRecoveryDurationMs > 0 &&
    report1.timing.withinRtoBudget === true &&
    report2Blocked.recoveryComplete === false &&
    report2Blocked.status === 'blocked_by_data_gaps' &&
    report2Blocked.unresolvedGaps.length >= 2 &&
    report3Resolved.recoveryComplete === true &&
    report3Resolved.unresolvedGaps.length === 0;

  return {
    rehearsedAt: new Date().toISOString(),
    environment: 'staging-testnet-isolated',
    networkPassphrase,
    contractId,
    scenarios: {
      duplicatePreventionAndBackfill: report1,
      blockedOnUnresolvedDataGap: report2Blocked,
      resolvedAfterGapBackfill: report3Resolved,
    },
    allCriteriaPassed,
  };
}
