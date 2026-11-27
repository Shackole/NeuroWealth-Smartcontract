import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentMetricsRegistry } from './prometheusMetrics';
import { recordSubmissionProviderSwitch } from './submissionMetrics';
import { createSubmissionStatusLookup, isSequenceMismatch, shouldRetrySequenceMismatch, SubmissionOutcomeUnknownError, submitExactlyOnceOnTimeout } from './transactionSubmission';

test('sequence mismatches retry within the configured bound', () => {
  const mismatch = new Error('tx_bad_seq: sequence number is too low');
  assert.equal(isSequenceMismatch(mismatch), true);
  assert.equal(shouldRetrySequenceMismatch(mismatch, 0, 3), true);
  assert.equal(shouldRetrySequenceMismatch(mismatch, 2, 3), false);
  assert.equal(shouldRetrySequenceMismatch(new Error('gateway timeout'), 0, 3), false);
});

test('returns the accepted transaction found after a gateway timeout without resubmitting', async () => {
  let submissions = 0;
  const result = await submitExactlyOnceOnTimeout(
    async () => { submissions += 1; throw new Error('504 gateway timeout'); },
    async () => ({ txHash: 'accepted-hash', ledger: 42 }),
    (error) => String(error).includes('timeout'),
    'accepted-hash',
  );
  assert.equal(submissions, 1);
  assert.deepEqual(result, { txHash: 'accepted-hash', ledger: 42 });
});

test('stops for operator reconciliation when a timed-out submission cannot be found', async () => {
  let submissions = 0;
  await assert.rejects(submitExactlyOnceOnTimeout(
    async () => { submissions += 1; throw new Error('ETIMEDOUT'); },
    async () => null,
    (error) => String(error).includes('ETIMEDOUT'),
    'unknown-hash',
  ), SubmissionOutcomeUnknownError);
  assert.equal(submissions, 1);
});

test('records one bounded provider switch for a submission and none for a primary-only success', async () => {
  const metric = 'stellar_submission_provider_switches_total';
  const lookup = createSubmissionStatusLookup(async (hash, onFallback) => {
    if (hash === 'fallback-hash') onFallback();
    return { hash, status: 'SUCCESS' };
  }, recordSubmissionProviderSwitch);

  assert.deepEqual(await lookup('primary-hash'), { hash: 'primary-hash', status: 'SUCCESS' });
  assert.ok(!(await agentMetricsRegistry.metrics()).includes(`${metric}{`));

  assert.deepEqual(await lookup('fallback-hash'), { hash: 'fallback-hash', status: 'SUCCESS' });
  await lookup('fallback-hash');
  const samples = (await agentMetricsRegistry.metrics()).split('\n').filter((line) => line.startsWith(`${metric}{`));
  assert.deepEqual(samples, [`${metric}{from_provider="primary",to_provider="fallback"} 1`]);
});
