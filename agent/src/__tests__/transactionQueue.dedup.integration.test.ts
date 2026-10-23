import Bull from 'bull';
import Redis from 'ioredis';
import type { Queue } from 'bull';
import type { TransactionJobData } from '../transactionQueue';

describe('transaction queue Redis deduplication', () => {
  const namespace = `dedup-test-${process.pid}-${Date.now()}`;
  const redisUrl = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379';
  let redis: Redis;
  let enqueue: typeof import('../transactionQueue').enqueueTransactionOnQueue;
  let moduleQueues: Array<Queue<TransactionJobData>> = [];

  beforeAll(async () => {
    process.env.REDIS_URL = redisUrl;
    process.env.TRANSACTION_DEDUP_NAMESPACE = namespace;
    jest.resetModules();
    const transactionQueueModule = require('../transactionQueue') as typeof import('../transactionQueue');
    enqueue = transactionQueueModule.enqueueTransactionOnQueue;
    moduleQueues = [transactionQueueModule.transactionQueue, transactionQueueModule.deadLetterQueue];
    redis = new Redis(redisUrl);
    await redis.ping();
  });

  afterAll(async () => {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `dedup:tx:${namespace}:*`, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
    await redis.quit();
    await Promise.all(moduleQueues.map((queue) => queue.close()));
    delete process.env.TRANSACTION_DEDUP_NAMESPACE;
  });

  function fakeQueue(add: (data: TransactionJobData, options: { jobId: string }) => Promise<unknown>) {
    return { client: redis, add: jest.fn(add) } as unknown as Queue<TransactionJobData>;
  }

  const job = (deduplicationKey: string): TransactionJobData => ({
    deduplicationKey,
    userAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    type: 'withdrawal',
    amountStroops: '10000000',
    requestedAt: new Date().toISOString(),
  });

  it('admits one logical job when concurrent callers reserve the same key', async () => {
    const queue = fakeQueue(async (_data, options) => ({ id: options.jobId }));
    const results = await Promise.all(Array.from({ length: 20 }, () => enqueue(queue, job('same-job'))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('releases its reservation after enqueue failure so a retry can succeed', async () => {
    const add = jest.fn()
      .mockRejectedValueOnce(new Error('injected enqueue failure'))
      .mockImplementation(async (_data: TransactionJobData, options: { jobId: string }) => ({ id: options.jobId }));
    const queue = fakeQueue(add);
    await expect(enqueue(queue, job('retry-job'))).rejects.toThrow('injected enqueue failure');
    await expect(enqueue(queue, job('retry-job'))).resolves.toMatchObject({ id: expect.stringMatching(/^dedup-/) });
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('cleans only its own Redis namespace', async () => {
    const foreignKey = `dedup:tx:unrelated:${namespace}`;
    await redis.set(foreignKey, 'keep');
    await redis.set(`dedup:tx:${namespace}:cleanup`, 'remove');
    const keys = await redis.keys(`dedup:tx:${namespace}:*`);
    if (keys.length) await redis.del(...keys);
    expect(await redis.get(foreignKey)).toBe('keep');
    await redis.del(foreignKey);
  });
});
