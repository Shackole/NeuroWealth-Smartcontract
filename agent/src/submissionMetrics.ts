import { Counter } from 'prom-client';
import { agentMetricsRegistry } from './prometheusMetrics';

const submissionProviderSwitches = new Counter({
  name: 'stellar_submission_provider_switches_total',
  help: 'Provider transitions during transaction submission status lookups',
  labelNames: ['from_provider', 'to_provider'] as const,
  registers: [agentMetricsRegistry],
});

export function recordSubmissionProviderSwitch(): void {
  submissionProviderSwitches.inc({ from_provider: 'primary', to_provider: 'fallback' });
}
