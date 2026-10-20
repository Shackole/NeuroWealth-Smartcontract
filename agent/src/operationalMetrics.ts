/** Small dependency-free Prometheus exporter for queue and event ingestion health. */

const environment = process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'development';
const network = process.env.STELLAR_NETWORK || 'testnet';

const queue = {
  pending: 0,
  oldestPendingAgeSeconds: 0,
  activeWorkers: 0,
  deadLetterJobs: 0,
  submissionFailures: 0,
  deadLetterGrowth: 0,
};

const events = {
  lastProcessedLedger: 0,
  latestObservedLedger: 0,
  lastCheckpointTimestamp: 0,
  processingFailures: 0,
};

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

const labels = `environment="${escapeLabel(environment)}",network="${escapeLabel(network)}"`;

export function setQueueMetrics(input: {
  pending: number;
  oldestPendingAgeSeconds: number;
  activeWorkers: number;
  deadLetterJobs: number;
}): void {
  queue.pending = input.pending;
  queue.oldestPendingAgeSeconds = input.oldestPendingAgeSeconds;
  queue.activeWorkers = input.activeWorkers;
  queue.deadLetterJobs = input.deadLetterJobs;
}

export function recordQueueSubmissionFailure(): void {
  queue.submissionFailures += 1;
}

export function recordDeadLetterGrowth(): void {
  queue.deadLetterGrowth += 1;
}

export function observeEventLedger(latestLedger: number): void {
  events.latestObservedLedger = Math.max(events.latestObservedLedger, latestLedger);
}

export function recordEventCheckpoint(processedLedger: number, latestLedger: number): void {
  events.lastProcessedLedger = Math.max(events.lastProcessedLedger, processedLedger);
  events.latestObservedLedger = Math.max(events.latestObservedLedger, latestLedger);
  events.lastCheckpointTimestamp = Date.now() / 1000;
}

export function recordEventProcessingFailure(): void {
  events.processingFailures += 1;
}

export function renderOperationalMetrics(): string {
  const checkpointAge = events.lastCheckpointTimestamp > 0
    ? Math.max(0, Date.now() / 1000 - events.lastCheckpointTimestamp)
    : 1_000_000_000;
  const lines = [
    '# HELP queue_depth Current number of waiting and delayed Bull jobs.',
    '# TYPE queue_depth gauge',
    `queue_depth{${labels},queue_name="transactions"} ${queue.pending}`,
    '# HELP neurowealth_queue_pending_jobs Waiting and delayed transaction jobs.',
    '# TYPE neurowealth_queue_pending_jobs gauge',
    `neurowealth_queue_pending_jobs{${labels},queue_name="transactions"} ${queue.pending}`,
    '# HELP neurowealth_queue_oldest_pending_age_seconds Age of the oldest pending financial job.',
    '# TYPE neurowealth_queue_oldest_pending_age_seconds gauge',
    `neurowealth_queue_oldest_pending_age_seconds{${labels},queue_name="transactions"} ${queue.oldestPendingAgeSeconds}`,
    '# HELP neurowealth_queue_active_workers Number of active transaction jobs (worker concurrency is five).',
    '# TYPE neurowealth_queue_active_workers gauge',
    `neurowealth_queue_active_workers{${labels},queue_name="transactions"} ${queue.activeWorkers}`,
    '# HELP neurowealth_queue_dead_letter_jobs Current dead-letter queue size.',
    '# TYPE neurowealth_queue_dead_letter_jobs gauge',
    `neurowealth_queue_dead_letter_jobs{${labels},queue_name="transactions"} ${queue.deadLetterJobs}`,
    '# HELP neurowealth_queue_submission_failures_total Failed transaction job attempts.',
    '# TYPE neurowealth_queue_submission_failures_total counter',
    `neurowealth_queue_submission_failures_total{${labels},queue_name="transactions"} ${queue.submissionFailures}`,
    '# HELP neurowealth_queue_dead_letter_growth_total Jobs moved into the dead-letter queue.',
    '# TYPE neurowealth_queue_dead_letter_growth_total counter',
    `neurowealth_queue_dead_letter_growth_total{${labels},queue_name="transactions"} ${queue.deadLetterGrowth}`,
    '# HELP neurowealth_event_listener_last_processed_ledger Highest ledger fully processed by the event listener.',
    '# TYPE neurowealth_event_listener_last_processed_ledger gauge',
    `neurowealth_event_listener_last_processed_ledger{${labels}} ${events.lastProcessedLedger}`,
    '# HELP neurowealth_event_listener_latest_observed_ledger Latest ledger observed from the configured RPC.',
    '# TYPE neurowealth_event_listener_latest_observed_ledger gauge',
    `neurowealth_event_listener_latest_observed_ledger{${labels}} ${events.latestObservedLedger}`,
    '# HELP neurowealth_event_listener_checkpoint_age_seconds Seconds since the last successful event poll and processing pass.',
    '# TYPE neurowealth_event_listener_checkpoint_age_seconds gauge',
    `neurowealth_event_listener_checkpoint_age_seconds{${labels}} ${checkpointAge}`,
    '# HELP neurowealth_event_listener_processing_failures_total Event polling or processing failures.',
    '# TYPE neurowealth_event_listener_processing_failures_total counter',
    `neurowealth_event_listener_processing_failures_total{${labels}} ${events.processingFailures}`,
  ];
  return `${lines.join('\n')}\n`;
}
