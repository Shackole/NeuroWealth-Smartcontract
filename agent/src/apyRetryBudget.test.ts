import assert from 'node:assert/strict';
import test from 'node:test';
import { ApyRetryBudget } from './apyRetryBudget';

test('retries transient provider responses and shares retry slots across providers', async () => {
  const budget = new ApyRetryBudget();
  const unavailable = { response: { status: 503 } };
  let attempts = 0;
  const request = async () => {
    attempts++;
    throw unavailable;
  };

  await Promise.all([
    assert.rejects(budget.run(request), error => error === unavailable),
    assert.rejects(budget.run(request), error => error === unavailable),
  ]);
  assert.equal(attempts, 4);
});

test('returns terminal responses immediately', async () => {
  const terminal = { response: { status: 400 } };
  let attempts = 0;
  await assert.rejects(new ApyRetryBudget().run(async () => {
    attempts++;
    throw terminal;
  }), error => error === terminal);
  assert.equal(attempts, 1);
});

test('skips retries that cannot fit and bounds an unresponsive request', async () => {
  const budget = new ApyRetryBudget(50);
  const throttled = { status: 429 };
  let attempts = 0;
  await assert.rejects(budget.run(async () => {
    attempts++;
    throw throttled;
  }), error => error === throttled);
  assert.equal(attempts, 1);
  await assert.rejects(budget.run(() => new Promise(() => {})), /retry window expired/);
  await assert.rejects(budget.run(async () => assert.fail('started after deadline')), /retry window expired/);
});
