import logger, { asyncLocalStorage } from '../logger';
import { enqueueTransaction, transactionQueue } from '../transactionQueue';

jest.mock('../logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  asyncLocalStorage: new (require('node:async_hooks').AsyncLocalStorage)(),
}));

jest.mock('bull', () => {
  const { EventEmitter } = require('node:events');
  return class extends EventEmitter {
    client = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') };
    process = jest.fn();
    add = jest.fn(async (data) => ({
      id: 'fixture-job',
      data: JSON.parse(JSON.stringify(data)),
    }));
  };
});

it('correlates enqueue and Bull completion after leaving the request context', async () => {
  const requestId = 'fixture-request';
  const job = await asyncLocalStorage.run({ requestId }, () => enqueueTransaction({
    deduplicationKey: 'fixture-dedup-key',
    userAddress: 'fixture-wallet',
    type: 'withdrawal',
    amountStroops: '10000000',
    xdrEnvelope: 'fixture-envelope',
    requestedAt: '2026-01-01T00:00:00.000Z',
  }));

  expect(job?.data.requestId).toBe(requestId);
  expect(asyncLocalStorage.getStore()).toBeUndefined();
  transactionQueue.emit('completed', job, { txHash: 'fixture-hash', ledger: 1 });

  expect(jest.mocked(logger.info).mock.calls).toEqual([
    [{ jobId: 'fixture-job', requestId, type: 'withdrawal' }, 'Transaction enqueued'],
    [{ jobId: 'fixture-job', requestId, txHash: 'fixture-hash' }, 'Transaction job completed'],
  ]);
});
