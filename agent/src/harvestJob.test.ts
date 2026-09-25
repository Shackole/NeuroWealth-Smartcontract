/**
 * Unit tests for HarvestJob — Issue #34.
 *
 * Run with: ts-node --transpile-only src/harvestJob.test.ts
 */

import { HarvestJob, HarvestConfig } from './harvestJob';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`  PASS: ${message}`);
  passed++;
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n[TEST] ${name}`);
  try {
    await fn();
  } catch {
    // error already logged by assert
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<HarvestConfig> = {}): HarvestConfig {
  return {
    minYieldUsdc: 1_000_000,
    slippageBps: 50,
    intervalMs: 86_400_000,
    maxConsecutiveFailures: 3,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

await test('calculateMinOut applies slippage correctly', async () => {
  const job = new HarvestJob(
    { executor: async () => ({ success: true }), getTvl: async () => 0 },
    makeConfig({ slippageBps: 50 }),
  );
  // 10_000_000 × (10000 - 50) / 10000 = 9_950_000
  assert(job.calculateMinOut(10_000_000) === 9_950_000, 'min_out at 0.5% slippage');
  assert(job.calculateMinOut(0) === 0, 'zero TVL → zero min_out');
});

await test('runOnce skips when TVL is below threshold', async () => {
  let executorCalled = false;
  const job = new HarvestJob(
    {
      executor: async () => { executorCalled = true; return { success: true }; },
      getTvl: async () => 500_000, // below minYieldUsdc of 1_000_000
    },
    makeConfig(),
  );

  const result = await job.runOnce();
  assert(!executorCalled, 'executor must not be called when below threshold');
  assert(result.skipped === 'below_threshold', 'result.skipped should be below_threshold');
  assert(result.success === true, 'skipped result counts as success');
});

await test('runOnce executes when TVL is above threshold', async () => {
  let executorCalled = false;
  let capturedMinOut = 0;
  const job = new HarvestJob(
    {
      executor: async (minOut) => {
        executorCalled = true;
        capturedMinOut = minOut;
        return { success: true };
      },
      getTvl: async () => 5_000_000,
    },
    makeConfig({ slippageBps: 100 }), // 1%
  );

  const result = await job.runOnce();
  assert(executorCalled, 'executor must be called when above threshold');
  assert(result.success, 'result should be successful');
  assert(capturedMinOut === 4_950_000, `min_out should be 4_950_000, got ${capturedMinOut}`);
  assert(result.preTvl === 5_000_000, 'preTvl should be recorded');
});

await test('runOnce logs pre- and post-harvest TVL', async () => {
  const tvlSequence = [5_000_000, 5_100_000]; // pre, post
  let callCount = 0;
  const job = new HarvestJob(
    {
      executor: async () => ({ success: true }),
      getTvl: async () => tvlSequence[callCount++] ?? 0,
    },
    makeConfig(),
  );

  const result = await job.runOnce();
  assert(result.preTvl === 5_000_000, 'preTvl should be 5_000_000');
  assert(result.postTvl === 5_100_000, 'postTvl should be 5_100_000');
  assert(result.yieldHarvested === 100_000, 'yieldHarvested should be 100_000');
});

await test('runOnce increments consecutiveFailures on failure', async () => {
  const job = new HarvestJob(
    {
      executor: async () => ({ success: false, error: 'tx rejected' }),
      getTvl: async () => 5_000_000,
    },
    makeConfig(),
  );

  await job.runOnce();
  assert(job.getConsecutiveFailures() === 1, 'consecutive failures should be 1 after one fail');
  await job.runOnce();
  assert(job.getConsecutiveFailures() === 2, 'consecutive failures should be 2 after two fails');
});

await test('runOnce resets consecutiveFailures on success', async () => {
  let attempt = 0;
  const job = new HarvestJob(
    {
      executor: async () => {
        attempt++;
        return { success: attempt >= 2 };
      },
      getTvl: async () => 5_000_000,
    },
    makeConfig(),
  );

  await job.runOnce(); // fail
  assert(job.getConsecutiveFailures() === 1, 'one failure recorded');
  await job.runOnce(); // success
  assert(job.getConsecutiveFailures() === 0, 'consecutive failures reset to 0 after success');
});

await test('alert fires after maxConsecutiveFailures', async () => {
  const alerts: string[] = [];
  const job = new HarvestJob(
    {
      executor: async () => ({ success: false, error: 'network error' }),
      getTvl: async () => 5_000_000,
      onAlert: (msg) => alerts.push(msg),
    },
    makeConfig({ maxConsecutiveFailures: 3 }),
  );

  await job.runOnce();
  await job.runOnce();
  assert(alerts.length === 0, 'no alert before threshold');
  await job.runOnce();
  assert(alerts.length === 1, 'alert fires at threshold (3 failures)');
  await job.runOnce();
  assert(alerts.length === 1, 'alert does not fire again until a new success or reset');
});

await test('skip or success clears the alert lock and resets the failure streak', async () => {
  const alerts: string[] = [];
  const job = new HarvestJob(
    {
      executor: async () => ({ success: false, error: 'network error' }),
      getTvl: async () => (jobState === 'below-threshold' ? 500_000 : 5_000_000),
      onAlert: (msg) => alerts.push(msg),
    },
    makeConfig({ maxConsecutiveFailures: 3 }),
  );

  let jobState: 'below-threshold' | 'healthy' = 'healthy';

  await job.runOnce();
  await job.runOnce();
  assert(job.getConsecutiveFailures() === 2, 'two consecutive failures recorded');

  jobState = 'below-threshold';
  const skipped = await job.runOnce();
  assert(skipped.skipped === 'below_threshold', 'skip is reported as intentionally skipped');
  assert(job.getConsecutiveFailures() === 0, 'skip clears the failure streak');
  assert(alerts.length === 0, 'skips do not trigger alerts');

  jobState = 'healthy';
  await job.runOnce();
  await job.runOnce();
  await job.runOnce();
  assert(alerts.length === 1, 'a new failure streak triggers exactly one alert');
});

await test('getHistory returns recent results', async () => {
  const job = new HarvestJob(
    {
      executor: async () => ({ success: true }),
      getTvl: async () => 5_000_000,
    },
    makeConfig(),
  );

  await job.runOnce();
  await job.runOnce();
  const history = job.getHistory();
  assert(history.length === 2, 'history should contain 2 results');
  assert(history[0].success, 'first result should be success');
});

await test('getTvl failure is reported as a failed harvest', async () => {
  const job = new HarvestJob(
    {
      executor: async () => ({ success: true }),
      getTvl: async () => { throw new Error('RPC error'); },
    },
    makeConfig(),
  );

  const result = await job.runOnce();
  assert(!result.success, 'TVL fetch failure should result in failed harvest');
  assert(result.error !== undefined, 'error message should be set');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
