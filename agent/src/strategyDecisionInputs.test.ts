import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import {
  DEFAULT_YIELD_CHECK_CONFIG,
  readStrategyDecisionInputs,
  YieldCheckJob,
} from './yieldCheckJob';
import type { ProtocolYieldData } from './yieldComparison';

test('reads the scoring snapshot persisted with a fixture decision', async () => {
  const observation: ProtocolYieldData = {
    protocolId: 'blend',
    name: 'Blend',
    type: 'blend',
    currentApy: 0.065,
    historicalApy7d: 0.064,
    historicalApy30d: 0.063,
    tvlUsdc: 5_000_000,
    volatility: 0.01,
    riskScore: 25,
    fetchedAt: 999_000,
  };

  let storedSnapshot: string | undefined;
  const pool = {
    async query(sql: string, values: unknown[]) {
      if (sql.includes('INSERT INTO yield_check_history')) {
        assert.equal(values[4], 'blend');
        assert.equal(typeof values[13], 'string');
        storedSnapshot = values[13] as string;
        return { rows: [] };
      }
      assert.match(sql, /SELECT input_snapshot FROM yield_check_history WHERE id = \$1/);
      assert.deepEqual(values, ['42']);
      assert.ok(storedSnapshot);
      return { rows: [{ input_snapshot: JSON.parse(storedSnapshot) }] };
    },
  } as unknown as Pool;

  const job = new YieldCheckJob(
    { ...DEFAULT_YIELD_CHECK_CONFIG, minImprovementThreshold: 0.007 },
    {
      apyFetchers: { blend: async () => ({ ...observation }) },
      getCurrentProtocol: async () => ({ protocolId: 'blend', deployedAmountStroops: 100 }),
      checkCooldown: async () => ({ cooldownLedgers: 0, lastRebalanceLedger: 0, currentLedger: 1 }),
      submitRebalance: async () => { throw new Error('Unexpected submission'); },
      now: () => 1_000_000,
    },
    pool,
  );

  const result = await job.runOnce();
  assert.equal(result.error, undefined);
  assert.deepEqual(await readStrategyDecisionInputs(pool, '42'), {
    modelRevision: 'yield-ranking-v1',
    riskFreeRate: 0.04,
    minImprovementThreshold: 0.007,
    observations: [observation],
  });
});
