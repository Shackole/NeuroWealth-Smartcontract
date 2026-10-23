import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withAccountSequenceLock } from './accountSequence';

test('same signing account jobs are serialized while different accounts run concurrently', async () => {
  const activeByAccount = new Map<string, number>();
  const maxByAccount = new Map<string, number>();
  let activeTotal = 0;
  let maxTotal = 0;
  const operation = (account: string) => withAccountSequenceLock(account, async () => {
    const active = (activeByAccount.get(account) ?? 0) + 1;
    activeByAccount.set(account, active);
    activeTotal += 1;
    maxTotal = Math.max(maxTotal, activeTotal);
    maxByAccount.set(account, Math.max(maxByAccount.get(account) ?? 0, active));
    await new Promise((resolve) => setTimeout(resolve, 10));
    activeByAccount.set(account, active - 1);
    activeTotal -= 1;
  });

  await Promise.all([operation('GSHARED'), operation('GSHARED'), operation('GOTHER')]);
  assert.equal(maxByAccount.get('GSHARED'), 1);
  assert.equal(maxByAccount.get('GOTHER'), 1);
  assert.equal(maxTotal, 2);
});
 test('a rejected operation releases its account for the next transaction', async () => {
  await assert.rejects(withAccountSequenceLock('GRECOVER', async () => { throw new Error('sequence failure'); }));
  assert.equal(await withAccountSequenceLock('GRECOVER', async () => 'submitted'), 'submitted');
});
