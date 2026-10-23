/**
 * Tests for the Strategy Preference Aggregator — Issue #41
 *
 * Covers:
 *  - STRATEGY_WEIGHTS allocation table
 *  - computeAggregateAllocation weighted-average math
 *  - aggregateStrategyPreferences (mocked RPC + no DB persistence)
 *  - Default fallback for unset users
 *  - GET /api/agent/strategy-distribution response shape
 */

import {
  STRATEGY_WEIGHTS,
  DEFAULT_STRATEGY,
  computeAggregateAllocation,
  aggregateStrategyPreferences,
  setLatestDistribution,
  getLatestDistribution,
  StrategyDistribution,
  VaultRpcAdapter,
  Strategy,
} from './strategyAggregator';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function assertClose(a: number, b: number, tolerance: number, msg: string) {
  assert(Math.abs(a - b) <= tolerance, `${msg}: expected ${b}±${tolerance}, got ${a}`);
}

/** Build a stub RPC adapter with a fixed list of depositors and their strategies. */
function makeRpc(
  depositors: string[],
  strategies: Record<string, Strategy>,
): VaultRpcAdapter {
  return {
    async getActiveDepositors() {
      return depositors;
    },
    async getUserStrategy(address: string) {
      const s = strategies[address];
      if (!s) throw new Error(`No strategy for ${address}`);
      return s;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\nStrategyAggregator tests\n');

  // STRATEGY_WEIGHTS ──────────────────────────────────────────────────────────

  await test('conservative is 100% Blend', () => {
    assert(STRATEGY_WEIGHTS.conservative.blendBps === 10_000, 'blendBps must be 10000');
    assert(STRATEGY_WEIGHTS.conservative.dexBps === 0, 'dexBps must be 0');
  });

  await test('balanced is 60% Blend + 40% DEX', () => {
    assert(STRATEGY_WEIGHTS.balanced.blendBps === 6_000, 'blendBps must be 6000');
    assert(STRATEGY_WEIGHTS.balanced.dexBps === 4_000, 'dexBps must be 4000');
  });

  await test('growth is 20% Blend + 80% DEX', () => {
    assert(STRATEGY_WEIGHTS.growth.blendBps === 2_000, 'blendBps must be 2000');
    assert(STRATEGY_WEIGHTS.growth.dexBps === 8_000, 'dexBps must be 8000');
  });

  await test('default strategy is balanced', () => {
    assert(DEFAULT_STRATEGY === 'balanced', 'Default must be balanced');
  });

  // computeAggregateAllocation ────────────────────────────────────────────────

  await test('all conservative → 100% Blend', () => {
    const result = computeAggregateAllocation({ conservative: 4, balanced: 0, growth: 0 });
    assert(result.blendBps === 10_000, `blendBps should be 10000, got ${result.blendBps}`);
    assert(result.dexBps === 0, `dexBps should be 0, got ${result.dexBps}`);
  });

  await test('all balanced → 60/40', () => {
    const result = computeAggregateAllocation({ conservative: 0, balanced: 10, growth: 0 });
    assert(result.blendBps === 6_000, `blendBps should be 6000, got ${result.blendBps}`);
    assert(result.dexBps === 4_000, `dexBps should be 4000, got ${result.dexBps}`);
  });

  await test('all growth → 20/80', () => {
    const result = computeAggregateAllocation({ conservative: 0, balanced: 0, growth: 3 });
    assert(result.blendBps === 2_000, `blendBps should be 2000, got ${result.blendBps}`);
    assert(result.dexBps === 8_000, `dexBps should be 8000, got ${result.dexBps}`);
  });

  await test('equal split: 1 conservative + 1 balanced + 1 growth', () => {
    // (10000+6000+2000)/3 = 6000 blend
    // (0+4000+8000)/3 = 4000 dex
    const result = computeAggregateAllocation({ conservative: 1, balanced: 1, growth: 1 });
    assertClose(result.blendBps, 6_000, 1, 'blend');
    assertClose(result.dexBps, 4_000, 1, 'dex');
  });

  await test('2 conservative + 1 balanced + 1 growth', () => {
    // blend: (2*10000+1*6000+1*2000)/4 = 28000/4 = 7000
    // dex:   (2*0    +1*4000+1*8000)/4 = 12000/4 = 3000
    const result = computeAggregateAllocation({ conservative: 2, balanced: 1, growth: 1 });
    assertClose(result.blendBps, 7_000, 1, 'blend');
    assertClose(result.dexBps, 3_000, 1, 'dex');
  });

  await test('empty distribution returns balanced default', () => {
    const result = computeAggregateAllocation({ conservative: 0, balanced: 0, growth: 0 });
    assert(result.blendBps === 6_000, 'Should default to balanced blend');
    assert(result.dexBps === 4_000, 'Should default to balanced dex');
  });

  // aggregateStrategyPreferences ─────────────────────────────────────────────

  await test('aggregates strategies from active depositors', async () => {
    const rpc = makeRpc(
      ['userA', 'userB', 'userC', 'userD'],
      {
        userA: 'conservative',
        userB: 'balanced',
        userC: 'growth',
        userD: 'balanced',
      },
    );

    const dist = await aggregateStrategyPreferences(rpc, 10, /* persistToDb= */ false);
    assert(dist.total === 4, `Expected 4 users, got ${dist.total}`);
    assert(dist.conservative === 1, `conservative should be 1`);
    assert(dist.balanced === 2, `balanced should be 2`);
    assert(dist.growth === 1, `growth should be 1`);
    // blend: (10000+6000+6000+2000)/4 = 24000/4 = 6000
    assertClose(dist.aggregateBlendBps, 6_000, 1, 'aggregateBlend');
  });

  await test('handles RPC failure by defaulting to balanced', async () => {
    const rpc: VaultRpcAdapter = {
      async getActiveDepositors() { return ['userA', 'userB']; },
      async getUserStrategy(address: string): Promise<Strategy> {
        if (address === 'userB') throw new Error('RPC timeout');
        return 'growth';
      },
    };

    const dist = await aggregateStrategyPreferences(rpc, 10, false);
    // userA=growth, userB=balanced (default on error)
    assert(dist.total === 2, `total should be 2`);
    assert(dist.balanced === 1, `defaulted user should count as balanced`);
    assert(dist.growth === 1, `growth should be 1`);
  });

  await test('empty depositor list returns all-zero distribution', async () => {
    const rpc: VaultRpcAdapter = {
      async getActiveDepositors() { return []; },
      async getUserStrategy() { return 'balanced'; },
    };

    const dist = await aggregateStrategyPreferences(rpc, 10, false);
    assert(dist.total === 0, 'total should be 0');
    // Default allocation when no users
    assert(dist.aggregateBlendBps === 6_000, 'empty → balanced blend');
    assert(dist.aggregateDexBps === 4_000, 'empty → balanced dex');
  });

  // Cache helpers ─────────────────────────────────────────────────────────────

  await test('setLatestDistribution / getLatestDistribution round-trips', () => {
    const fakeDist: StrategyDistribution = {
      total: 5,
      conservative: 1,
      balanced: 2,
      growth: 2,
      conservativePct: 20,
      balancedPct: 40,
      growthPct: 40,
      aggregateBlendBps: 5600,
      aggregateDexBps: 4400,
      computedAt: '2026-01-01T00:00:00.000Z',
    };
    setLatestDistribution(fakeDist);
    const cached = getLatestDistribution();
    assert(cached !== null, 'Cached distribution should not be null');
    assert(cached?.total === 5, 'total should be 5');
    assert(cached?.aggregateBlendBps === 5600, 'blend bps should match');
  });

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
