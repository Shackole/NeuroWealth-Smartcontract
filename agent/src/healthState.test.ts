import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheRpcHealthProbe } from './healthState';

test('shares a pending RPC health probe and refreshes after its completed result expires', async (t) => {
  t.mock.method(Date, 'now', () => now);
  let now = 0;
  let resolveProbe!: (status: string) => void;
  const probe = t.mock.fn(() => new Promise<string>((resolve) => { resolveProbe = resolve; }));
  const check = cacheRpcHealthProbe(probe, 100);

  const first = check();
  now = 200;
  assert.equal(check(), first);
  await Promise.resolve();
  assert.equal(probe.mock.callCount(), 1);
  resolveProbe('error');
  assert.equal(await first, 'error');

  now = 299;
  assert.equal(await check(), 'error');
  assert.equal(probe.mock.callCount(), 1);

  now = 300;
  const next = check();
  await Promise.resolve();
  assert.equal(probe.mock.callCount(), 2);
  resolveProbe('ok');
  assert.equal(await next, 'ok');
});
