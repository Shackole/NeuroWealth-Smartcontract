import assert from 'node:assert/strict';
import { BackgroundWork } from './backgroundWork';

async function testStopsNewJobsAndDrainsInFlightWork(): Promise<void> {
  const work = new BackgroundWork();
  let finish!: () => void;
  let started = false;
  const task = work.run(
    () =>
      new Promise<void>((resolve) => {
        started = true;
        finish = resolve;
      }),
  );

  await Promise.resolve();
  assert.equal(started, true);

  const drain = work.drain(1000);
  assert.equal(work.run(async () => undefined), null);

  finish();
  assert.equal(await drain, true);
  await task;
}

async function testReportsDeadlineWhenWorkDoesNotFinish(): Promise<void> {
  const work = new BackgroundWork();
  work.run(() => new Promise<void>(() => undefined));

  assert.equal(await work.drain(10), false);
  assert.equal(work.run(async () => undefined), null);
}

void (async () => {
  await testStopsNewJobsAndDrainsInFlightWork();
  await testReportsDeadlineWhenWorkDoesNotFinish();
  console.log('backgroundWork tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
