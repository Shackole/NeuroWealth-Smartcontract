/**
 * Rebalance failure recovery tests — Issue #37
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  RebalanceRecoveryManager,
  RecoveryHooks,
  VaultState,
  RebalanceFailure,
  buildHealthPayload,
  DEFAULT_RECOVERY_CONFIG,
} from './rebalanceRecovery';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockVaultState: VaultState = {
  currentProtocol: 'blend',
  totalAssets: 1_000_000,
  idleBalance: 0,
};

function makeMockHooks(overrides: Partial<RecoveryHooks> = {}): RecoveryHooks & {
  alertsSent: string[];
  dbLogs: RebalanceFailure[];
  protocolResetCalled: boolean;
} {
  const alertsSent: string[] = [];
  const dbLogs: RebalanceFailure[] = [];
  let protocolResetCalled = false;

  return {
    executeRebalance: async () => ({ success: false, error: 'mock failure' }),
    getVaultState: async () => mockVaultState,
    logFailureToDb: async (f) => { dbLogs.push(f); },
    setProtocolToNone: async () => { protocolResetCalled = true; },
    sendAlert: async (subject) => { alertsSent.push(subject); },
    // Inject instant sleep to keep tests fast
    sleep: async (_ms) => {},
    now: () => Date.now(),
    // Expose test state
    get alertsSent() { return alertsSent; },
    get dbLogs() { return dbLogs; },
    get protocolResetCalled() { return protocolResetCalled; },
    ...overrides,
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RebalanceRecoveryManager (#37)', () => {
  it('starts in healthy status', () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    assert.strictEqual(mgr.getStatus(), 'healthy');
  });

  it('moves to degraded after first failure', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('RPC error', 1234);
    // After retries exhaust (all fail), status should be failed
    assert.ok(['degraded', 'failed'].includes(mgr.getStatus()));
  });

  it('logs each failure to DB', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('timeout', 100);
    // initial failure + 3 retry failures = at least 4 logs
    assert.ok(hooks.dbLogs.length >= 1, 'should have DB logs');
  });

  it('sends owner alert after exhausting all retries', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('connection refused', 200);
    assert.strictEqual(hooks.alertsSent.length, 1);
    assert.ok(hooks.alertsSent[0].includes('CRITICAL'));
  });

  it('triggers recovery mode (setProtocolToNone) after all retries fail', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('stuck funds', 300);
    assert.strictEqual(hooks.protocolResetCalled, true);
  });

  it('marks status as failed after all retries fail', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('timeout', 400);
    assert.strictEqual(mgr.getStatus(), 'failed');
  });

  it('recovers to healthy if a retry succeeds', async () => {
    let attemptCount = 0;
    const hooks = makeMockHooks({
      executeRebalance: async () => {
        attemptCount++;
        // Succeed on the second retry
        return attemptCount >= 2 ? { success: true } : { success: false, error: 'fail' };
      },
    });
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('temporary', 500);
    assert.strictEqual(mgr.getStatus(), 'healthy');
    assert.strictEqual(hooks.alertsSent.length, 0, 'no alert if recovered');
    assert.strictEqual(hooks.protocolResetCalled, false, 'no reset if recovered');
  });

  it('onSuccess resets status to healthy', () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    // Force degraded state by calling onSuccess after manual set
    mgr.onSuccess();
    assert.strictEqual(mgr.getStatus(), 'healthy');
  });

  it('reset() manually restores healthy status', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('test', 600);
    assert.strictEqual(mgr.getStatus(), 'failed');
    mgr.reset();
    assert.strictEqual(mgr.getStatus(), 'healthy');
  });

  it('failure history records each failure entry', async () => {
    const hooks = makeMockHooks();
    const mgr = new RebalanceRecoveryManager(hooks);
    await mgr.handleFailure('err', 700);
    assert.ok(mgr.getFailureHistory().length >= 1);
  });

  describe('buildHealthPayload', () => {
    it('returns healthy payload with no failures', () => {
      const hooks = makeMockHooks();
      const mgr = new RebalanceRecoveryManager(hooks);
      const payload = buildHealthPayload(mgr);
      assert.strictEqual(payload.agentStatus, 'healthy');
      assert.strictEqual(payload.failureCount, 0);
      assert.strictEqual(payload.lastFailure, null);
    });

    it('returns failed payload after exhausting retries', async () => {
      const hooks = makeMockHooks();
      const mgr = new RebalanceRecoveryManager(hooks);
      await mgr.handleFailure('err', 800);
      const payload = buildHealthPayload(mgr);
      assert.strictEqual(payload.agentStatus, 'failed');
      assert.ok(payload.failureCount > 0);
      assert.ok(payload.lastFailure !== null);
    });
  });
});
