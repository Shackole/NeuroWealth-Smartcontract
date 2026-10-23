/**
 * Automated rebalancing scheduler with configurable intervals (Issue #651).
 *
 * Features:
 *  - Configurable intervals: `hourly`, `4h`, `daily` (owner setting)
 *  - Gas-price awareness: scheduled rebalances are skipped while network fees
 *    exceed `maxGasPriceStroops` (an alert is emitted instead of a rebalance)
 *  - Event-driven triggers: large TVL changes and protocol utilization spikes
 *  - Priority-ordered queue: event-driven jobs preempt scheduled ones
 *  - Circuit breaker: pauses scheduling after N consecutive failures
 *  - History logging with before/after APY and gas-cost attribution
 *  - Alert hooks for failed / missed / gas-skipped rebalances
 *  - Distributed lease (Issue #420): only one replica owns a given rebalance
 *    interval; a crashed owner is replaced after lease expiry.
 *
 * The scheduler is transport-agnostic: rebalance execution is injected via
 * `hooks.executor`, so unit tests can stub it and production can bind it to
 * the vault client's `rebalance` entrypoint. Distributed coordination is
 * injected via `hooks.leaseStore`, so tests can use an in-memory store and
 * production can bind it to a durable store (Redis/Postgres).
 */

import logger from './logger';

export type RebalanceInterval = 'hourly' | '4h' | 'daily';

/** Interval length in milliseconds. */
export const INTERVAL_MS: Record<RebalanceInterval, number> = {
  hourly: 3_600_000,
  '4h': 14_400_000,
  daily: 86_400_000,
};

export type RebalanceTrigger =
  | 'scheduled'
  | 'tvl_change'
  | 'utilization_spike'
  | 'manual';

/** A queued rebalance request. Lower `priority` runs first. */
export interface RebalanceJob {
  id: string;
  trigger: RebalanceTrigger;
  priority: number;
  dueAt: number;
  createdAt: number;
  payload?: Record<string, unknown>;
}

/** Outcome of one executed (or skipped) job. */
export interface RebalanceExecution {
  jobId: string;
  trigger: RebalanceTrigger;
  executedAt: number;
  success: boolean;
  skipped?: 'gas_price_too_high';
  beforeApy?: number;
  afterApy?: number;
  apyDelta?: number;
  gasCostStroops?: number;
  error?: string;
}

export interface RebalanceExecutionResult {
  success: boolean;
  beforeApy?: number;
  afterApy?: number;
  gasCostStroops?: number;
  error?: string;
}

export type RebalanceExecutor = (
  job: RebalanceJob,
) => RebalanceExecutionResult | Promise<RebalanceExecutionResult>;

export type SchedulerAlertType =
  | 'circuit_breaker_tripped'
  | 'rebalance_failed'
  | 'rebalance_skipped_gas'
  | 'scheduled_rebalance_missed';

export interface SchedulerAlert {
  type: SchedulerAlertType;
  message: string;
  at: number;
  context?: Record<string, unknown>;
}

export interface SchedulerConfig {
  interval: RebalanceInterval;
  /** Scheduled rebalances are skipped above this gas price (stroops). */
  maxGasPriceStroops?: number;
  /** Consecutive failures before the circuit breaker pauses scheduling. */
  circuitBreakerThreshold: number;
  /** Enqueue an event-driven job when |ΔTVL| >= this many bps. */
  tvlChangeTriggerBps: number;
  /**
   * Distributed lease TTL in ms (Issue #420). A crashed owner's lease expires
   * after this window and another replica may take over the interval.
   */
  leaseTtlMs?: number;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  interval: '4h',
  maxGasPriceStroops: 100_000,
  circuitBreakerThreshold: 3,
  tvlChangeTriggerBps: 500,
  leaseTtlMs: 120_000,
};

/**
 * Durable distributed lease store (Issue #420).
 *
 * Implementations must be atomic: `acquire` succeeds for exactly one caller
 * when the lease is free or expired, and `renew`/`release` only succeed for
 * the current owner. Production binds this to Redis (`SET NX PX`) or a
 * Postgres row with `SELECT ... FOR UPDATE`.
 */
export interface LeaseStore {
  /** Attempt to acquire `key` for `owner` until `expiresAt`. */
  acquire(key: string, owner: string, expiresAt: number): Promise<boolean>;
  /** Extend an owned lease to `expiresAt`; false if no longer owner. */
  renew(key: string, owner: string, expiresAt: number): Promise<boolean>;
  /** Release an owned lease; false if no longer owner. */
  release(key: string, owner: string): Promise<boolean>;
}

/** In-memory lease store for single-process use and tests. */
export class InMemoryLeaseStore implements LeaseStore {
  private leases = new Map<string, { owner: string; expiresAt: number }>();

  async acquire(key: string, owner: string, expiresAt: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.leases.get(key);
    if (existing && existing.expiresAt > now && existing.owner !== owner) {
      return false;
    }
    this.leases.set(key, { owner, expiresAt });
    return true;
  }

  async renew(key: string, owner: string, expiresAt: number): Promise<boolean> {
    const existing = this.leases.get(key);
    if (!existing || existing.owner !== owner) return false;
    this.leases.set(key, { owner, expiresAt });
    return true;
  }

  async release(key: string, owner: string): Promise<boolean> {
    const existing = this.leases.get(key);
    if (!existing || existing.owner !== owner) return false;
    this.leases.delete(key);
    return true;
  }
}

export interface SchedulerHooks {
  executor: RebalanceExecutor;
  gasPriceProvider?: () => Promise<number>;
  onAlert?: (alert: SchedulerAlert) => void;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Durable distributed lease store (Issue #420). */
  leaseStore?: LeaseStore;
  /** Unique identity for this replica; defaults to a random id. */
  replicaId?: string;
}


/** Aggregated scheduler statistics for dashboards (#652). */
export interface SchedulerStats {
  totalEnqueued: number;
  totalExecuted: number;
  totalSucceeded: number;
  totalFailed: number;
  totalSkippedGas: number;
  avgGasCostStroops: number;
  avgApyDelta: number;
  consecutiveFailures: number;
  circuitBreakerTripped: boolean;
  queueDepth: number;
}

/** Priority ordering: event-driven > manual > scheduled. */
const PRIORITY: Record<RebalanceTrigger, number> = {
  utilization_spike: 0,
  tvl_change: 1,
  manual: 2,
  scheduled: 3,
};

export class RebalanceScheduler {
  private queue: RebalanceJob[] = [];
  private history: RebalanceExecution[] = [];
  private consecutiveFailures = 0;
  private circuitBreakerTripped = false;
  private jobCounter = 0;
  private lastRunAt: number | null = null;
  private lastMissedCheckAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly replicaId: string;
  private readonly leaseStore: LeaseStore;
  private leaseHeld = false;

  constructor(
    private config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
    private readonly hooks: SchedulerHooks,
  ) {
    this.replicaId =
      hooks.replicaId ?? `replica_${Math.random().toString(36).slice(2, 10)}`;
    this.leaseStore = hooks.leaseStore ?? new InMemoryLeaseStore();
  }

  /** Starts the wall-clock loop (production entrypoint). */
  start(pollMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), pollMs);
    logger.info({ interval: this.config.interval, pollMs }, 'Rebalance scheduler started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Rebalance scheduler stopped');
    }
  }

  /** Enqueues a rebalance job; the queue stays sorted by (priority, dueAt). */
  enqueue(
    trigger: RebalanceTrigger,
    dueAt?: number,
    payload?: Record<string, unknown>,
  ): RebalanceJob {
    const now = this.now();
    const job: RebalanceJob = {
      id: `job_${++this.jobCounter}`,
      trigger,
      priority: PRIORITY[trigger],
      dueAt: dueAt ?? now,
      createdAt: now,
      payload,
    };
    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority || a.dueAt - b.dueAt);
    logger.debug({ jobId: job.id, trigger }, 'Rebalance job enqueued');
    return job;
  }

  /**
   * Event-driven hook: call after every TVL observation. Enqueues a
   * high-priority job when the TVL moved by at least `tvlChangeTriggerBps`.
   */
  onTvlObservation(tvlBefore: number, tvlAfter: number): boolean {
    if (tvlBefore <= 0) return false;
    const changeBps = Math.round(
      (Math.abs(tvlAfter - tvlBefore) / tvlBefore) * 10_000,
    );
    if (changeBps >= this.config.tvlChangeTriggerBps) {
      this.enqueue('tvl_change', undefined, { tvlBefore, tvlAfter, changeBps });
      return true;
    }
    return false;
  }

  /** Event-driven hook: protocol utilization spike (bps of optimal). */
  onUtilizationObservation(protocol: string, utilizationBps: number): boolean {
    if (utilizationBps >= 9_500) {
      this.enqueue('utilization_spike', undefined, { protocol, utilizationBps });
      return true;
    }
    return false;
  }

  /**
   * Processes due jobs and emits the scheduled job when the interval elapsed.
   * Safe to call repeatedly; the wall-clock loop calls it on a timer.
   *
   * Scheduled jobs are gated by a durable distributed lease (Issue #420) so
   * only one replica owns a given interval. Event-driven and manual jobs are
   * not lease-gated (they are triggered by external observations).
   */
  async tick(nowOverride?: number): Promise<RebalanceExecution[]> {
    const now = nowOverride ?? this.now();

    if (this.circuitBreakerTripped) {
      logger.warn('Circuit breaker open: scheduling paused');
      return [];
    }

    // Interval-based schedule emission. Avoid stacking duplicate scheduled
    // jobs when one is already queued (e.g. manually enqueued or carried
    // over from a previous partial tick).
    const hasPendingScheduled = this.queue.some((j) => j.trigger === 'scheduled');
    if (
      !hasPendingScheduled &&
      (this.lastRunAt === null ||
        now - this.lastRunAt >= INTERVAL_MS[this.config.interval])
    ) {
      // Only the replica that owns the interval lease may emit the job.
      if (await this.acquireLease(now)) {
        this.enqueue('scheduled');
      }
    }

    // Missed-schedule detection: no run for 2x the interval while healthy.
    if (this.lastRunAt !== null) {
      const lastCheck = this.lastMissedCheckAt ?? 0;
      if (
        now - this.lastRunAt >= 2 * INTERVAL_MS[this.config.interval] &&
        now - lastCheck >= INTERVAL_MS[this.config.interval]
      ) {
        this.emitAlert(
          'scheduled_rebalance_missed',
          `No rebalance for ${now - this.lastRunAt}ms`,
          { lastRunAt: this.lastRunAt },
        );
        this.lastMissedCheckAt = now;
      }
    }

    const executed: RebalanceExecution[] = [];
    while (
      this.queue.length > 0 &&
      this.queue[0].dueAt <= now &&
      !this.circuitBreakerTripped
    ) {
      const job = this.queue.shift()!;
      executed.push(await this.runJob(job, now));
    }
    return executed;
  }

  /**
   * Acquires or renews the interval lease for this replica (Issue #420).
   * Returns true when this replica owns the interval and may emit a job.
   */
  private async acquireLease(now: number): Promise<boolean> {
    const key = this.leaseKey();
    const ttl = this.config.leaseTtlMs ?? DEFAULT_SCHEDULER_CONFIG.leaseTtlMs!;
    const expiresAt = now + ttl;
    try {
      if (this.leaseHeld) {
        const renewed = await this.leaseStore.renew(key, this.replicaId, expiresAt);
        if (renewed) {
          logger.info(
            { key, replicaId: this.replicaId, expiresAt },
            'Rebalance interval lease renewed',
          );
          return true;
        }
        // Lost the lease (expired and taken over by another replica).
        this.leaseHeld = false;
        logger.warn(
          { key, replicaId: this.replicaId },
          'Rebalance interval lease lost',
        );
      }
      const acquired = await this.leaseStore.acquire(key, this.replicaId, expiresAt);
      if (acquired) {
        this.leaseHeld = true;
        logger.info(
          { key, replicaId: this.replicaId, expiresAt },
          'Rebalance interval lease acquired',
        );
      } else {
        logger.debug(
          { key, replicaId: this.replicaId },
          'Rebalance interval lease held by another replica',
        );
      }
      return acquired;
    } catch (err) {
      logger.error(
        { key, replicaId: this.replicaId, err },
        'Rebalance interval lease operation failed',
      );
      return false;
    }
  }

  /** Releases the interval lease if held (Issue #420). */
  async releaseLease(): Promise<void> {
    if (!this.leaseHeld) return;
    const key = this.leaseKey();
    try {
      const released = await this.leaseStore.release(key, this.replicaId);
      this.leaseHeld = false;
      logger.info(
        { key, replicaId: this.replicaId, released },
        'Rebalance interval lease released',
      );
    } catch (err) {
      logger.error(
        { key, replicaId: this.replicaId, err },
        'Rebalance interval lease release failed',
      );
    }
  }

  private leaseKey(): string {
    return `rebalance:lease:${this.config.interval}`;
  }

  /** Owner setting: change the rebalance interval at runtime. */
  setInterval(interval: RebalanceInterval): void {
    this.config = { ...this.config, interval };
    logger.info({ interval }, 'Rebalance interval updated');
  }

  private now(): number {
    return this.hooks.now ? this.hooks.now() : Date.now();
  }

  private emitAlert(
    type: SchedulerAlertType,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const alert: SchedulerAlert = { type, message, at: this.now(), context };
    logger.warn({ alert }, 'Rebalance scheduler alert');
    this.hooks.onAlert?.(alert);
  }

  private async runJob(job: RebalanceJob, now: number): Promise<RebalanceExecution> {
    const execution: RebalanceExecution = {
      jobId: job.id,
      trigger: job.trigger,
      executedAt: now,
      success: false,
    };

    // Gas-price gate for scheduled jobs.
    if (job.trigger === 'scheduled' && this.hooks.gasPriceProvider) {
      try {
        const gasPrice = await this.hooks.gasPriceProvider();
        const max = this.config.maxGasPriceStroops;
        if (max !== undefined && gasPrice > max) {
          execution.skipped = 'gas_price_too_high';
          execution.success = true;
          this.history.push(execution);
          this.emitAlert(
            'rebalance_skipped_gas',
            `Gas price ${gasPrice} exceeds max ${max}`,
            { jobId: job.id, gasPrice, max },
          );
          return execution;
        }
      } catch (err) {
        logger.warn({ jobId: job.id, err }, 'Gas price lookup failed');
      }
    }

    try {
      const result = await this.hooks.executor(job);
      execution.success = result.success;
      execution.beforeApy = result.beforeApy;
      execution.afterApy = result.afterApy;
      execution.gasCostStroops = result.gasCostStroops;
      execution.error = result.error;
      if (
        execution.beforeApy !== undefined &&
        execution.afterApy !== undefined
      ) {
        execution.apyDelta = execution.afterApy - execution.beforeApy;
      }
    } catch (err) {
      execution.success = false;
      execution.error = err instanceof Error ? err.message : String(err);
    }

    this.history.push(execution);
    this.lastRunAt = now;

    if (execution.success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures += 1;
      this.emitAlert('rebalance_failed', execution.error ?? 'Rebalance failed', {
        jobId: job.id,
      });
      if (this.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        this.circuitBreakerTripped = true;
        this.emitAlert(
          'circuit_breaker_tripped',
          `Circuit breaker tripped after ${this.consecutiveFailures} failures`,
          { consecutiveFailures: this.consecutiveFailures },
        );
      }
    }

    // Release the interval lease once the scheduled job has run so another
    // replica can pick up the next interval.
    if (job.trigger === 'scheduled') {
      await this.releaseLease();
    }

    return execution;
  }

  /** Returns aggregated statistics for dashboards (#652). */
  getStats(): SchedulerStats {
    const executed = this.history.length;
    const succeeded = this.history.filter((h) => h.success && !h.skipped).length;
    const failed = this.history.filter((h) => !h.success).length;
    const skippedGas = this.history.filter(
      (h) => h.skipped === 'gas_price_too_high',
    ).length;
    const gasCosts = this.history
      .map((h) => h.gasCostStroops)
      .filter((v): v is number => v !== undefined);
    const apyDeltas = this.history
      .map((h) => h.apyDelta)
      .filter((v): v is number => v !== undefined);
    const avg = (xs: number[]): number =>
      xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

    return {
      totalEnqueued: this.jobCounter,
      totalExecuted: executed,
      totalSucceeded: succeeded,
      totalFailed: failed,
      totalSkippedGas: skippedGas,
      avgGasCostStroops: avg(gasCosts),
      avgApyDelta: avg(apyDeltas),
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerTripped: this.circuitBreakerTripped,
      queueDepth: this.queue.length,
    };
  }

  /** Returns the execution history (most recent last). */
  getHistory(): RebalanceExecution[] {
    return [...this.history];
  }
}
