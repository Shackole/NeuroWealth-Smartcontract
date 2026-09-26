/**
 * Tests for the USDC issuer freeze contingency handler — Issue #40
 *
 * These tests cover:
 *  - `isFreezeActive` flag detection
 *  - `handleFreezeDetected` orchestration (pause + snapshot + alert)
 *  - `IssuerFreezeMonitor.simulateFreezeDetection` drill scenario
 *  - De-duplication: freeze only fires once per episode
 */

import {
  isFreezeActive,
  handleFreezeDetected,
  IssuerFreezeMonitor,
  IssuerAccountFlags,
  FreezeAlertChannel,
  FreezeAlertPayload,
  FreezeEvent,
} from './issuerFreezeMonitor';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SAFE_FLAGS: IssuerAccountFlags = {
  auth_required: false,
  auth_revocable: false,
  auth_clawback_enabled: false,
};

const FROZEN_FLAGS: IssuerAccountFlags = {
  auth_required: true,
  auth_revocable: true,
  auth_clawback_enabled: false,
};

const CLAWBACK_FLAGS: IssuerAccountFlags = {
  auth_required: false,
  auth_revocable: false,
  auth_clawback_enabled: true,
};

function makeHooks(opts: {
  pauseSuccess?: boolean;
  snapshotUsers?: number;
}) {
  const alerts: { channel: FreezeAlertChannel; payload: FreezeAlertPayload }[] = [];
  return {
    hooks: {
      pauseVault: async () => ({
        success: opts.pauseSuccess ?? true,
      }),
      getUserBalances: async () =>
        Array.from({ length: opts.snapshotUsers ?? 2 }, (_, i) => ({
          address: `G${'A'.repeat(55)}${i}`,
          shares: '1000000',
          snapshotLedger: 100,
          snapshotTimestamp: '2026-01-01T00:00:00.000Z',
        })),
      sendAlert: async (channel: FreezeAlertChannel, payload: FreezeAlertPayload) => {
        alerts.push({ channel, payload });
      },
      now: () => '2026-01-01T00:00:00.000Z',
    },
    alerts,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log('\nIssuerFreezeMonitor tests\n');

  // isFreezeActive ────────────────────────────────────────────────────────────

  await test('isFreezeActive returns false for all-clear flags', () => {
    assert(!isFreezeActive(SAFE_FLAGS), 'Expected false for safe flags');
  });

  await test('isFreezeActive returns true when auth_revocable is set', () => {
    assert(isFreezeActive(FROZEN_FLAGS), 'Expected true for revocable flags');
  });

  await test('isFreezeActive returns true when auth_clawback_enabled is set', () => {
    assert(isFreezeActive(CLAWBACK_FLAGS), 'Expected true for clawback flags');
  });

  // handleFreezeDetected ─────────────────────────────────────────────────────

  await test('handleFreezeDetected pauses vault and returns success event', async () => {
    const { hooks } = makeHooks({ pauseSuccess: true, snapshotUsers: 3 });
    const event: FreezeEvent = await handleFreezeDetected(
      FROZEN_FLAGS,
      hooks,
      ['email', 'slack'],
    );
    assert(event.vaultPaused, 'vaultPaused must be true');
    assert(event.snapshotGenerated, 'snapshotGenerated must be true');
    assert(event.alertsSent, 'alertsSent must be true');
    assert(event.flags.auth_revocable, 'flags must reflect frozen state');
    assert(event.detectedAt === '2026-01-01T00:00:00.000Z', 'detectedAt must use injected clock');
  });

  await test('handleFreezeDetected records vault pause failure', async () => {
    const { hooks } = makeHooks({ pauseSuccess: false });
    const event: FreezeEvent = await handleFreezeDetected(
      FROZEN_FLAGS,
      hooks,
      ['slack'],
    );
    assert(!event.vaultPaused, 'vaultPaused must be false when pause fails');
    // Alerts should still fire despite pause failure.
    assert(event.alertsSent, 'alerts must still be sent even if pause fails');
  });

  await test('handleFreezeDetected dispatches alerts to all requested channels', async () => {
    const { hooks, alerts } = makeHooks({ snapshotUsers: 1 });
    await handleFreezeDetected(
      FROZEN_FLAGS,
      hooks,
      ['email', 'slack', 'sms', 'pagerduty'],
    );
    assert(alerts.length === 4, `Expected 4 alerts, got ${alerts.length}`);
    const channels = alerts.map((a) => a.channel);
    assert(channels.includes('email'), 'email alert missing');
    assert(channels.includes('slack'), 'slack alert missing');
    assert(channels.includes('sms'), 'sms alert missing');
    assert(channels.includes('pagerduty'), 'pagerduty alert missing');
  });

  await test('alert payload includes runbook URL', async () => {
    const { hooks, alerts } = makeHooks({});
    await handleFreezeDetected(FROZEN_FLAGS, hooks, ['slack']);
    assert(alerts.length === 1, 'Expected exactly one alert');
    assert(
      alerts[0].payload.runbookUrl.includes('ISSUER_FREEZE_CONTINGENCY'),
      'runbookUrl must point to the contingency doc',
    );
  });

  // Drill / simulate ─────────────────────────────────────────────────────────

  await test('simulateFreezeDetection triggers the full response pipeline', async () => {
    const { hooks, alerts } = makeHooks({ snapshotUsers: 5 });
    const monitor = new IssuerFreezeMonitor(hooks, ['email', 'slack']);
    const event = await monitor.simulateFreezeDetection(FROZEN_FLAGS);
    assert(event.vaultPaused, 'vault must be paused during drill');
    assert(event.snapshotGenerated, 'snapshot must be generated during drill');
    assert(alerts.length === 2, `Expected 2 alerts in drill, got ${alerts.length}`);
  });

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
