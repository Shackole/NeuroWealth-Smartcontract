/**
 * Unit tests for YieldCheckJob (Issue #22).
 *
 * Runs with:  ts-node --transpile-only src/yieldCheckJob.test.ts
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import {
  YieldCheckJob,
  YieldCheckConfig,
  YieldCheckHooks,
  YieldCheckResult,
} from './yieldCheckJob';
import { ProtocolYieldData } from './yieldComparison';

// ── Minimal pg.Pool stub ───────────────────────────────────────────────────────

function makePoolStub(queryFn?: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return {
    query: queryFn ?? (async () => ({ rows: [] })),
  } as any;
}

// ── Default hook factories ─────────────────────────────────────────────────────

function blendApyData(apy = 0.065): ProtocolYieldData {
  return {
    protocolId: 'blend',
    name: 'Blend Protocol',
    type: 'blend',
    currentApy: apy,
    historicalApy7d: apy - 0.001,
    historicalApy30d: apy - 0.002,
    tvlUsdc: 5_000_000,
    volatility: 0.01,
    riskScore: 25,
  };
}

function dexApyData(apy = 0.085): ProtocolYieldData {
  return {
    protocolId: 'dex',
    name: 'Stellar DEX LP',
    type: 'dex_lp',
    currentApy: apy,
    historicalApy7d: apy - 0.003,
    historicalApy30d: apy - 0.006,
    tvlUsdc: 2_000_000,
    volatility: 0.04,
    riskScore: 55,
  };
}

function makeHooks(overrides: Partial<YieldCheckHooks> = {}): YieldCheckHooks {
  return {
    apyFetchers: {
      blend: async () => blendApyData(),
      dex: async () => dexApyData(),
    },
    getCurrentProtocol: async () => ({
      protocolId: 'blend',
      deployedAmountStroops: 100_000_000,
    }),
    checkCooldown: async () => ({
      cooldownLedgers: 720,
      lastRebalanceLedger: 0,
      currentLedger: 10_000,
    }),
    submitRebalance: async (_protocol, _apy, _minOut) => ({
      txHash: 'abc123deadbeef',
    }),
    now: () => 1_000_000,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<YieldCheckConfig> = {}): YieldCheckConfig {
  return {
    intervalMs: 3_600_000,
    slippageBps: 50,
    minImprovementThreshold: 0.005,
    vaultContractId: 'CTEST123',
    agentSecret: '',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    ...overrides,
  };
}

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
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

// ── Tests ──────────────────────────────────────────────────────────────────────

console.log('\nYieldCheckJob tests\n');

await test('triggers rebalance when DEX APY is 2% higher than Blend', async () => {
  const pool = makePoolStub();
  const rebalanceCalls: { protocol: string; apy: number; minOut: number }[] = [];

  const hooks = makeHooks({
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.090), // 2.5% improvement
    },
    submitRebalance: async (protocol, apy, minOut) => {
      rebalanceCalls.push({ protocol, apy, minOut });
      return { txHash: 'tx_rebalance_001' };
    },
  });

  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  const result: YieldCheckResult = await job.runOnce();

  assert.strictEqual(result.rebalanceTriggered, true, 'rebalance should be triggered');
  assert.strictEqual(result.bestProtocol, 'dex', 'best protocol should be dex');
  assert.ok(result.txHash === 'tx_rebalance_001', 'txHash should be set');
  assert.strictEqual(rebalanceCalls.length, 1, 'submitRebalance called once');
  assert.ok(result.minOut !== undefined, 'minOut should be set');
});

await test('skips rebalance when improvement is below 0.5% threshold', async () => {
  const rebalanceCalls: unknown[] = [];

  const hooks = makeHooks({
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.068), // only 0.3% improvement
    },
    submitRebalance: async () => {
      rebalanceCalls.push(true);
      return { txHash: 'should_not_happen' };
    },
  });

  const pool = makePoolStub();
  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  const result = await job.runOnce();

  assert.strictEqual(result.rebalanceTriggered, false, 'rebalance should NOT be triggered');
  assert.strictEqual(rebalanceCalls.length, 0, 'submitRebalance should not be called');
  assert.ok(result.skipReason?.includes('improvement_below_threshold'), 'should set skip reason');
});

await test('skips rebalance when already on best protocol', async () => {
  const hooks = makeHooks({
    getCurrentProtocol: async () => ({
      protocolId: 'dex',
      deployedAmountStroops: 100_000_000,
    }),
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.090),
    },
  });

  const pool = makePoolStub();
  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  const result = await job.runOnce();

  assert.strictEqual(result.rebalanceTriggered, false, 'no rebalance when already optimal');
  assert.ok(
    result.skipReason === 'already_on_best_protocol',
    `expected already_on_best_protocol, got: ${result.skipReason}`,
  );
});

await test('respects rebalance cooldown from vault contract', async () => {
  const hooks = makeHooks({
    checkCooldown: async () => ({
      cooldownLedgers: 1_000,
      lastRebalanceLedger: 9_500, // 500 ledgers ago
      currentLedger: 10_000,     // only 500 elapsed, need 1000
    }),
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.090),
    },
  });

  const pool = makePoolStub();
  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  const result = await job.runOnce();

  assert.strictEqual(result.rebalanceTriggered, false, 'should respect cooldown');
  assert.ok(result.skipReason?.startsWith('cooldown_active'), `expected cooldown_active, got: ${result.skipReason}`);
  assert.strictEqual(result.cooldownLedgersRemaining, 500);
});

await test('calculates min_out correctly using slippage bps', async () => {
  const calls: { minOut: number }[] = [];

  const hooks = makeHooks({
    getCurrentProtocol: async () => ({
      protocolId: 'blend',
      deployedAmountStroops: 100_000_000, // 100 USDC in stroops
    }),
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.090),
    },
    submitRebalance: async (_p, _a, minOut) => {
      calls.push({ minOut });
      return { txHash: 'tx_min_out' };
    },
  });

  const pool = makePoolStub();
  // 50 bps = 0.5% slippage
  const job = new YieldCheckJob(makeConfig({ slippageBps: 50 }), hooks, pool);
  const result = await job.runOnce();

  assert.strictEqual(result.rebalanceTriggered, true);
  // min_out = 100_000_000 * (1 - 50/10_000) = 100_000_000 * 0.9950 = 99_500_000
  assert.strictEqual(calls[0]?.minOut, 99_500_000, `expected 99_500_000, got ${calls[0]?.minOut}`);
});

await test('stores result to database on success', async () => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = makePoolStub(async (sql, params) => {
    queries.push({ sql, params: params ?? [] });
    return { rows: [] };
  });

  const hooks = makeHooks({
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.090),
    },
  });

  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  await job.runOnce();

  // CREATE TABLE + INSERT should both be called
  const insertCall = queries.find((q) => q.sql.includes('INSERT INTO yield_check_history'));
  assert.ok(insertCall !== undefined, 'should INSERT into yield_check_history');
  assert.ok(
    Array.isArray(insertCall.params) && insertCall.params.length >= 7,
    'INSERT should have parameters',
  );
});

await test('stores error to database when submitRebalance throws', async () => {
  const insertParams: unknown[] = [];
  const pool = makePoolStub(async (sql, params) => {
    if (sql.includes('INSERT INTO yield_check_history')) {
      insertParams.push(...(params ?? []));
    }
    return { rows: [] };
  });

  const hooks = makeHooks({
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => dexApyData(0.090),
    },
    submitRebalance: async () => {
      throw new Error('RPC timeout');
    },
  });

  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  const result = await job.runOnce();

  assert.strictEqual(result.rebalanceTriggered, false);
  assert.ok(result.error?.includes('RPC timeout'), `expected error msg, got: ${result.error}`);
});

await test('handles APY fetch failure gracefully (partial results)', async () => {
  const hooks = makeHooks({
    apyFetchers: {
      blend: async () => blendApyData(0.065),
      dex: async () => { throw new Error('DEX unavailable'); },
    },
  });

  const pool = makePoolStub();
  const job = new YieldCheckJob(makeConfig(), hooks, pool);
  const result = await job.runOnce();

  // Should not crash; blend is current protocol and only protocol that fetched,
  // so it stays on blend
  assert.ok(result !== undefined, 'should return a result even with partial APY failure');
  assert.strictEqual(result.rebalanceTriggered, false, 'should not rebalance with only 1 protocol');
});

await test('start() and stop() manage the timer lifecycle', async () => {
  const pool = makePoolStub();
  const hooks = makeHooks();
  const job = new YieldCheckJob(makeConfig({ intervalMs: 999_999_999 }), hooks, pool);

  assert.strictEqual(job.isRunning(), false, 'should not be running before start');
  job.start();
  assert.strictEqual(job.isRunning(), true, 'should be running after start');
  job.stop();
  assert.strictEqual(job.isRunning(), false, 'should not be running after stop');
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
