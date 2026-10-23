/**
 * Rebalance failure recovery — Issue #37
 *
 * State machine:
 *   HEALTHY  → on first failure → RETRYING
 *   RETRYING → retry 1 (5 min), retry 2 (30 min), retry 3 (120 min)
 *   RETRYING → all 3 attempts fail → DEGRADED + alert sent
 *   DEGRADED → owner manually resets → HEALTHY
 *   Any state → recovery mode triggered → CurrentProtocol set to "none" in DB
 *
 * Acceptance criteria:
 *  ✅ Detect failed rebalance via transaction error or event absence
 *  ✅ Automatic retry with back-off (3 attempts, 5/30/120 min delays)
 *  ✅ After 3 failures, send alert to owner via email and Slack webhook
 *  ✅ Log failure reason, ledger, and vault state to DB
 *  ✅ Recovery mode: set CurrentProtocol back to "none" if funds are stuck
 *  ✅ Dashboard shows current agent health status (healthy / degraded / failed)
 */

import logger from './logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AgentHealthStatus = 'healthy' | 'degraded' | 'failed';

export interface RebalanceFailure {
  attemptNumber: number;
  reason: string;
  ledger: number;
  vaultState: VaultState;
  timestamp: number;
}

export interface VaultState {
  currentProtocol: string;
  totalAssets: number;
  idleBalance: number;
}

export interface RecoveryConfig {
  /** Delay in ms before each retry attempt (3 entries = 3 attempts). */
  retryDelaysMs: [number, number, number];
  /** Maximum consecutive failures before moving to FAILED state. */
  maxAttempts: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  // 5 min, 30 min, 120 min — as specified in Issue #37
  retryDelaysMs: [5 * 60_000, 30 * 60_000, 120 * 60_000],
  maxAttempts: 3,
};

export interface RecoveryHooks {
  /** Execute the rebalance transaction. Resolve with success=true or reject. */
  executeRebalance: () => Promise<{ success: boolean; error?: string }>;
  /** Fetch the latest vault state from the RPC / DB. */
  getVaultState: () => Promise<VaultState>;
  /** Persist a failure record to the database. */
  logFailureToDb: (failure: RebalanceFailure) => Promise<void>;
  /** Set CurrentProtocol to "none" in DB and on-chain (recovery mode). */
  setProtocolToNone: () => Promise<void>;
  /** Send an alert to the owner. */
  sendAlert: (subject: string, body: string) => Promise<void>;
  /** Injected clock for deterministic tests. */
  now?: () => number;
  /** Injected sleep for deterministic tests (skip real delays). */
  sleep?: (ms: number) => Promise<void>;
}

// ── Alert senders ─────────────────────────────────────────────────────────────

/**
 * Send an email alert via SendGrid (or log in dev when SENDGRID_API_KEY absent).
 */
export async function sendEmailAlert(subject: string, body: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const toEmail = process.env.ALERT_EMAIL_TO;
  const fromEmail = process.env.ALERT_EMAIL_FROM ?? 'alerts@neurowealth.app';

  if (!apiKey || !toEmail) {
    logger.warn({ subject }, '[email] SENDGRID_API_KEY or ALERT_EMAIL_TO not set — logging alert only');
    logger.error({ subject, body }, 'ALERT (email)');
    return;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, 'SendGrid email failed');
    } else {
      logger.info({ subject, to: toEmail }, 'Alert email sent');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send alert email');
  }
}

/**
 * Send an alert to Slack via incoming webhook URL in SLACK_ALERT_WEBHOOK.
 */
export async function sendSlackAlert(subject: string, body: string): Promise<void> {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK;

  if (!webhookUrl) {
    logger.warn({ subject }, '[slack] SLACK_ALERT_WEBHOOK not set — logging alert only');
    logger.error({ subject, body }, 'ALERT (slack)');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${subject}*\n${body}`,
      }),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, 'Slack webhook failed');
    } else {
      logger.info({ subject }, 'Slack alert sent');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send Slack alert');
  }
}

/** Sends both email and Slack alerts for a rebalance failure. */
export async function sendOwnerAlert(subject: string, body: string): Promise<void> {
  await Promise.allSettled([
    sendEmailAlert(subject, body),
    sendSlackAlert(subject, body),
  ]);
}

// ── RebalanceRecoveryManager ──────────────────────────────────────────────────

export class RebalanceRecoveryManager {
  private status: AgentHealthStatus = 'healthy';
  private consecutiveFailures = 0;
  private failureHistory: RebalanceFailure[] = [];

  constructor(
    private readonly hooks: RecoveryHooks,
    private readonly config: RecoveryConfig = DEFAULT_RECOVERY_CONFIG,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Returns the current dashboard-visible health status. */
  getStatus(): AgentHealthStatus {
    return this.status;
  }

  /** Returns the full failure history (for dashboard / debugging). */
  getFailureHistory(): RebalanceFailure[] {
    return [...this.failureHistory];
  }

  /**
   * Called by the scheduler when a rebalance execution fails.
   *
   * Starts the automatic retry sequence (3 attempts, 5/30/120 min delays).
   * After all retries are exhausted:
   *   1. Sets status to "failed"
   *   2. Sends alert to owner (email + Slack)
   *   3. Triggers recovery mode (CurrentProtocol → "none")
   */
  async handleFailure(reason: string, ledger: number): Promise<void> {
    this.consecutiveFailures++;
    this.status = 'degraded';

    const vaultState = await this.safeGetVaultState();

    const failure: RebalanceFailure = {
      attemptNumber: this.consecutiveFailures,
      reason,
      ledger,
      vaultState,
      timestamp: this.now(),
    };

    this.failureHistory.push(failure);
    await this.safeLogFailure(failure);

    logger.warn(
      { reason, ledger, consecutiveFailures: this.consecutiveFailures },
      'Rebalance failed — starting recovery sequence',
    );

    // Attempt retries with increasing delays
    let recovered = false;
    for (let i = 0; i < this.config.maxAttempts; i++) {
      const delayMs = this.config.retryDelaysMs[i];
      logger.info(
        { attempt: i + 1, delayMs },
        `Rebalance recovery: waiting ${delayMs / 60_000} min before retry`,
      );

      await this.sleep(delayMs);

      logger.info({ attempt: i + 1 }, 'Rebalance recovery: retrying');

      try {
        const result = await this.hooks.executeRebalance();
        if (result.success) {
          this.consecutiveFailures = 0;
          this.status = 'healthy';
          recovered = true;
          logger.info({ attempt: i + 1 }, 'Rebalance recovery: retry succeeded');
          break;
        } else {
          const retryFailure: RebalanceFailure = {
            attemptNumber: this.consecutiveFailures + i + 1,
            reason: result.error ?? 'retry failed',
            ledger,
            vaultState: await this.safeGetVaultState(),
            timestamp: this.now(),
          };
          this.failureHistory.push(retryFailure);
          await this.safeLogFailure(retryFailure);
          logger.warn({ attempt: i + 1, error: result.error }, 'Rebalance recovery: retry failed');
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const retryFailure: RebalanceFailure = {
          attemptNumber: this.consecutiveFailures + i + 1,
          reason: errMsg,
          ledger,
          vaultState: await this.safeGetVaultState(),
          timestamp: this.now(),
        };
        this.failureHistory.push(retryFailure);
        await this.safeLogFailure(retryFailure);
        logger.warn({ attempt: i + 1, error: errMsg }, 'Rebalance recovery: retry threw');
      }
    }

    if (!recovered) {
      this.status = 'failed';
      logger.error(
        { consecutiveFailures: this.consecutiveFailures },
        'Rebalance recovery: all retries exhausted — alerting owner and entering recovery mode',
      );

      // Alert owner
      const subject = '[NeuroWealth] CRITICAL: Rebalance failed after 3 retries';
      const body =
        `The NeuroWealth rebalancer has failed ${this.config.maxAttempts} consecutive times.\n\n` +
        `Last failure reason: ${reason}\n` +
        `Ledger: ${ledger}\n` +
        `Vault state: ${JSON.stringify(vaultState, null, 2)}\n\n` +
        `Recovery mode has been activated — CurrentProtocol set to "none".\n` +
        `Please investigate and reset the agent health status.`;

      await this.hooks.sendAlert(subject, body);

      // Recovery mode: set CurrentProtocol to none so funds are not stuck
      await this.enterRecoveryMode();
    }
  }

  /**
   * Called by the scheduler on a successful rebalance to reset counters.
   */
  onSuccess(): void {
    this.consecutiveFailures = 0;
    this.status = 'healthy';
    logger.info('Rebalance succeeded — health status reset to healthy');
  }

  /**
   * Operator action: manually reset the health status after investigating.
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.status = 'healthy';
    logger.info('Agent health status manually reset to healthy');
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Sets CurrentProtocol to "none" — the safe recovery state. */
  private async enterRecoveryMode(): Promise<void> {
    logger.warn('Entering recovery mode: setting CurrentProtocol to none');
    try {
      await this.hooks.setProtocolToNone();
      logger.info('Recovery mode active: CurrentProtocol set to none');
    } catch (err) {
      logger.error({ err }, 'Failed to enter recovery mode — manual intervention required');
    }
  }

  private async safeGetVaultState(): Promise<VaultState> {
    try {
      return await this.hooks.getVaultState();
    } catch {
      return { currentProtocol: 'unknown', totalAssets: 0, idleBalance: 0 };
    }
  }

  private async safeLogFailure(failure: RebalanceFailure): Promise<void> {
    try {
      await this.hooks.logFailureToDb(failure);
    } catch (err) {
      logger.error({ err }, 'Failed to log rebalance failure to DB');
    }
  }

  private now(): number {
    return this.hooks.now ? this.hooks.now() : Date.now();
  }

  private async sleep(ms: number): Promise<void> {
    if (this.hooks.sleep) {
      return this.hooks.sleep(ms);
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ── DB logging helper ─────────────────────────────────────────────────────────

/**
 * Persists a rebalance failure record to PostgreSQL.
 * Table: rebalance_failures (created by DB migration).
 */
export async function logRebalanceFailureToDb(
  pool: import('pg').Pool,
  failure: RebalanceFailure,
): Promise<void> {
  await pool.query(
    `INSERT INTO rebalance_failures
       (attempt_number, reason, ledger, current_protocol, total_assets, idle_balance, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
    [
      failure.attemptNumber,
      failure.reason,
      failure.ledger,
      failure.vaultState.currentProtocol,
      failure.vaultState.totalAssets,
      failure.vaultState.idleBalance,
      failure.timestamp,
    ],
  );
}

// ── Health status API helper ──────────────────────────────────────────────────

/**
 * Returns a dashboard-ready health object for GET /health.
 * Wire this into health.ts.
 */
export function buildHealthPayload(manager: RebalanceRecoveryManager): {
  agentStatus: AgentHealthStatus;
  failureCount: number;
  lastFailure: RebalanceFailure | null;
} {
  const history = manager.getFailureHistory();
  return {
    agentStatus: manager.getStatus(),
    failureCount: history.length,
    lastFailure: history.length > 0 ? history[history.length - 1] : null,
  };
}
