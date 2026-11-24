const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const Bull = require('bull');

test('settling the final withdrawal leaves an empty queue and allows the next enqueue', {
  timeout: 15_000,
}, async () => {
  const queue = new Bull(`withdrawal-readback-${randomUUID()}`, process.env.TEST_REDIS_URL, {
    defaultJobOptions: { removeOnComplete: true },
  });
  const first = { type: 'withdrawal', amountStroops: '20000000' };
  const next = { type: 'withdrawal', amountStroops: '10000000' };

  try {
    const firstJob = await queue.add(first);
    assert.deepEqual((await queue.getWaiting()).map((job) => job.data), [first]);

    // The processor models a successful settlement without signing or broadcasting a transaction.
    const settled = firstJob.finished();
    void queue.process(async () => ({ settled: true }));
    assert.deepEqual(await settled, { settled: true });

    assert.deepEqual(await queue.getWaiting(), []);
    assert.deepEqual(await queue.getActive(), []);
    assert.deepEqual(await queue.getDelayed(), []);
    assert.equal(await queue.getJob(firstJob.id), null);

    // Pause the local worker before reading the next enqueue to avoid a race.
    await queue.pause(true);
    const nextJob = await queue.add(next);
    assert.equal(Number(nextJob.id), Number(firstJob.id) + 1);
    const waiting = await queue.getWaiting();
    assert.deepEqual(waiting.map((job) => ({ id: job.id, data: job.data })), [
      { id: nextJob.id, data: next },
    ]);
    assert.deepEqual(await queue.getActive(), []);
  } finally {
    try {
      await queue.pause(true);
      await queue.obliterate({ force: true });
    } finally {
      await queue.close();
    }
  }
});
