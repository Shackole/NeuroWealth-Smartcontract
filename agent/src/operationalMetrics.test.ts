import assert from 'node:assert/strict';
import { renderOperationalMetrics } from './operationalMetrics';
import { readQueueStats } from './queueStats';

const deposit = { data: { type: 'deposit' } };
const withdrawal = { data: { type: 'withdrawal' } };
const rebalance = { data: { type: 'rebalance' } };
const unknown = { data: { type: 'unrecognized-job-type' } };
function assertGauge(state: 'waiting' | 'active', jobClass: string, expected: number): void {
  const sample = renderOperationalMetrics().split('\n').find((line) =>
    line.startsWith(`neurowealth_queue_${state}_jobs_by_class{`)
      && line.endsWith(`job_class="${jobClass}"} ${expected}`),
  );
  assert.ok(sample, `Expected ${state}/${jobClass} to be ${expected}`);
}

async function main(): Promise<void> {
  let waiting = [deposit, deposit, withdrawal, unknown];
  let active = [withdrawal, rebalance, { data: {} }];
  const fixture = {
    getWaitingCount: async () => waiting.length,
    getActiveCount: async () => active.length,
    getCompletedCount: async () => 0,
    getFailedCount: async () => 0,
    getDelayedCount: async () => 2,
    isPaused: async () => false,
    getJobs: async () => [],
    getWaiting: async () => waiting,
    getActive: async () => active,
  };
  const deadLetter = { getWaitingCount: async () => 0, getFailedCount: async () => 0 };
  const stats = await readQueueStats(fixture, deadLetter);
  assert.equal(stats.waiting, 4);
  assert.equal(stats.active, 3);
  assert.equal(stats.delayed, 2);
  assertGauge('waiting', 'deposit', 2);
  assertGauge('waiting', 'withdrawal', 1);
  assertGauge('waiting', 'rebalance', 0);
  assertGauge('waiting', 'other', 1);
  assertGauge('active', 'deposit', 0);
  assertGauge('active', 'withdrawal', 1);
  assertGauge('active', 'rebalance', 1);
  assertGauge('active', 'other', 1);
  assert.ok(!renderOperationalMetrics().includes('unrecognized-job-type'));

  waiting = [];
  active = [];
  await readQueueStats(fixture, deadLetter);
  for (const jobClass of ['deposit', 'withdrawal', 'rebalance', 'other']) {
    assertGauge('waiting', jobClass, 0);
    assertGauge('active', jobClass, 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
