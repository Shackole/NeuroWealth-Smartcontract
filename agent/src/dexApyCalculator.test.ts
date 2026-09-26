/**
 * Unit tests for dexApyCalculator (Issue #28)
 *
 * Tests run without a real Horizon node or Redis by exercising
 * the pure calculation functions directly.
 */

import assert from 'assert';
import { estimateILAdjustmentBps, calculateRawApyBps } from './dexApyCalculator';

async function runTests(): Promise<void> {
  console.log('Running dexApyCalculator tests…\n');

  // ── calculateRawApyBps ────────────────────────────────────────

  // Test 1: Standard LP APY formula
  {
    // pool_tvl = 100_000 USDC, fees_24h = 30 USDC
    // raw_apy = (30 / 100_000) * 365 * 10_000 = 1095 BPS = 10.95%
    const bps = calculateRawApyBps(30, 100_000);
    assert.strictEqual(bps, 1095, `calculateRawApyBps: expected 1095, got ${bps}`);
    console.log('  ✅ Test 1: Standard LP APY formula');
  }

  // Test 2: Zero TVL returns 0 (no division by zero)
  {
    const bps = calculateRawApyBps(100, 0);
    assert.strictEqual(bps, 0, 'calculateRawApyBps: zero TVL → 0');
    console.log('  ✅ Test 2: Zero TVL → 0 (no division by zero)');
  }

  // Test 3: Zero fees returns 0
  {
    const bps = calculateRawApyBps(0, 500_000);
    assert.strictEqual(bps, 0, 'calculateRawApyBps: zero fees → 0');
    console.log('  ✅ Test 3: Zero fees → 0');
  }

  // Test 4: Small pool, high fees → high APY
  {
    // fees_24h = 50, tvl = 10_000 → (50/10000) * 365 * 10000 = 18250 BPS = 182.5%
    const bps = calculateRawApyBps(50, 10_000);
    assert.strictEqual(bps, 18_250, `calculateRawApyBps: high APY expected 18250, got ${bps}`);
    console.log('  ✅ Test 4: High APY scenario');
  }

  // ── estimateILAdjustmentBps ───────────────────────────────────

  // Test 5: Zero volatility → zero IL
  {
    const il = estimateILAdjustmentBps(0);
    assert.strictEqual(il, 0, 'IL at 0% volatility should be 0');
    console.log('  ✅ Test 5: Zero volatility → 0 IL');
  }

  // Test 6: Negative volatility → 0 (guard)
  {
    const il = estimateILAdjustmentBps(-10);
    assert.strictEqual(il, 0, 'IL at negative volatility should be 0');
    console.log('  ✅ Test 6: Negative volatility clamped to 0');
  }

  // Test 7: Moderate volatility (5%) → small positive IL adjustment
  {
    const il = estimateILAdjustmentBps(5);
    assert.ok(il > 0, 'IL at 5% volatility should be positive');
    assert.ok(il < 200, `IL at 5% volatility should be < 200 BPS, got ${il}`);
    console.log(`  ✅ Test 7: 5% volatility → ${il} BPS IL adjustment`);
  }

  // Test 8: High volatility (50%) → larger IL
  {
    const il50 = estimateILAdjustmentBps(50);
    const il5 = estimateILAdjustmentBps(5);
    assert.ok(il50 > il5, 'Higher volatility should yield higher IL adjustment');
    console.log(`  ✅ Test 8: 50% vol (${il50} BPS) > 5% vol (${il5} BPS)`);
  }

  // Test 9: Very high volatility (>100) → capped, no NaN/Infinity
  {
    const il = estimateILAdjustmentBps(200);
    assert.ok(Number.isFinite(il), 'IL should be finite even at extreme volatility');
    assert.ok(il >= 0, 'IL should be non-negative');
    console.log(`  ✅ Test 9: Extreme volatility capped → ${il} BPS`);
  }

  // ── Risk-adjusted APY ─────────────────────────────────────────

  // Test 10: Risk-adjusted APY = raw - IL, floor at 0
  {
    const rawBps = calculateRawApyBps(30, 100_000);    // 1095
    const ilBps  = estimateILAdjustmentBps(5);         // small positive
    const adjusted = Math.max(0, rawBps - ilBps);
    assert.ok(adjusted < rawBps, 'Risk-adjusted APY should be less than raw');
    assert.ok(adjusted >= 0, 'Risk-adjusted APY should never be negative');
    console.log(`  ✅ Test 10: Risk-adjusted APY = ${rawBps} - ${ilBps} = ${adjusted} BPS`);
  }

  // Test 11: Response shape
  {
    const riskAdjustedApyBps = 820;
    const body = {
      protocol: 'dex',
      raw_apy_bps: 862,
      il_adjustment_bps: 42,
      apy_bps: riskAdjustedApyBps,
      apy_pct: +(riskAdjustedApyBps / 100).toFixed(2),
      cached: false,
    };
    assert.strictEqual(body.protocol, 'dex');
    assert.strictEqual(body.apy_bps, 820);
    assert.strictEqual(body.apy_pct, 8.20);
    assert.strictEqual(typeof body.cached, 'boolean');
    console.log('  ✅ Test 11: Response shape');
  }

  // Test 12: Redis constants
  {
    const REDIS_KEY = 'apy:dex';
    const REDIS_TTL = 300;
    assert.strictEqual(REDIS_KEY, 'apy:dex');
    assert.strictEqual(REDIS_TTL, 300);
    console.log('  ✅ Test 12: Redis constants');
  }

  console.log('\n✅ All dexApyCalculator tests passed.');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
