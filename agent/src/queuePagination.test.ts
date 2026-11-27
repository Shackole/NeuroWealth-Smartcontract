import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeQueueCursor, paginateQueueJobs } from './queuePagination';

test('continues across equal timestamps despite inserts ahead of the cursor', () => {
  const original = [
    { id: '8', timestamp: 100 },
    { id: '9', timestamp: 100 },
    { id: '7', timestamp: 99 },
    { id: '10', timestamp: 100 },
  ];
  const first = paginateQueueJobs(original, 2);
  assert.deepEqual(first.jobs.map(({ id }) => id), ['10', '9']);
  assert.ok(first.nextCursor);

  const second = paginateQueueJobs(
    [...original, { id: '11', timestamp: 100 }, { id: '12', timestamp: 101 }],
    2,
    decodeQueueCursor(first.nextCursor),
  );
  assert.deepEqual(second.jobs.map(({ id }) => id), ['8', '7']);
  assert.equal(second.nextCursor, null);
});
