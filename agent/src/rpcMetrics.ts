import { performance } from 'node:perf_hooks';
import { Histogram } from 'prom-client';
import { agentMetricsRegistry } from './prometheusMetrics';

type RpcMethodGroup = 'read' | 'submission';

const rpcDuration = new Histogram({
  name: 'stellar_rpc_round_trip_duration_seconds',
  help: 'Duration of Stellar RPC requests, including failed requests',
  labelNames: ['method_group', 'outcome'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [agentMetricsRegistry],
});

export async function measureRpcRoundTrip<T>(
  group: RpcMethodGroup,
  request: () => Promise<T>,
  isSuccessful: (result: T) => boolean = () => true,
): Promise<T> {
  const start = performance.now();
  let outcome: 'success' | 'failure' = 'failure';
  try {
    const result = await request();
    if (isSuccessful(result)) outcome = 'success';
    return result;
  } finally {
    rpcDuration.observe({ method_group: group, outcome }, (performance.now() - start) / 1_000);
  }
}
