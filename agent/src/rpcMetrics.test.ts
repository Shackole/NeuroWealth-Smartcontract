import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentMetricsRegistry } from './prometheusMetrics';
import { measureRpcRoundTrip } from './rpcMetrics';

test('records round-trip timing for each RPC method group and outcome', async () => {
  const error = new Error('unreachable');
  for (const group of ['read', 'submission'] as const) {
    assert.equal(await measureRpcRoundTrip(group, async () => 42), 42);
    await assert.rejects(measureRpcRoundTrip(group, async () => { throw error; }), (err) => err === error);
  }
  assert.equal(await measureRpcRoundTrip('submission', async () => 'ERROR', () => false), 'ERROR');

  const metrics = await agentMetricsRegistry.metrics();
  for (const group of ['read', 'submission'] as const) {
    for (const outcome of ['success', 'failure'] as const) {
      const labels = `{method_group="${group}",outcome="${outcome}"}`;
      const count = group === 'submission' && outcome === 'failure' ? 2 : 1;
      assert.ok(metrics.includes(`stellar_rpc_round_trip_duration_seconds_count${labels} ${count}`));
      assert.ok(metrics.includes(`stellar_rpc_round_trip_duration_seconds_sum${labels} `));
    }
  }
});
