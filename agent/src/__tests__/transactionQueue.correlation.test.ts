import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import Module from 'node:module';
import { mock, test } from 'node:test';
import type { RequestContext } from '../logger';
import type { TransactionJobData } from '../transactionQueue';

test('correlates enqueue and Bull completion after leaving the request context', async () => {
  const info = mock.fn();
  const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
  const logger = { info, warn() {}, error() {} };
  class FixtureQueue extends EventEmitter {
    client = { get: async () => null, set: async () => 'OK' };
    process() {}
    async add(data: TransactionJobData) {
      return { id: 'fixture-job', data: JSON.parse(JSON.stringify(data)) };
    }
  }

  const loader = Module as unknown as {
    _load(request: string, parent: NodeModule, isMain: boolean): unknown;
  };
  const load = loader._load;
  const queuePath = require.resolve('../transactionQueue');
  const contextPath = require.resolve('../requestContext');
  const stub = mock.method(loader, '_load', function (request, parent, isMain) {
    if (parent?.filename === queuePath && request === 'bull') return FixtureQueue;
    if ((parent?.filename === queuePath || parent?.filename === contextPath) && request === './logger') {
      return { __esModule: true, default: logger, asyncLocalStorage };
    }
    return load.call(this, request, parent, isMain);
  });
  const { enqueueTransaction, transactionQueue } = require('../transactionQueue') as typeof import('../transactionQueue');
  stub.mock.restore();

  const requestId = 'fixture-request';
  const job = await asyncLocalStorage.run({ requestId }, () => enqueueTransaction({
    deduplicationKey: 'fixture-dedup-key',
    userAddress: 'fixture-wallet',
    type: 'withdrawal',
    amountStroops: '10000000',
    xdrEnvelope: 'fixture-envelope',
    requestedAt: '2026-01-01T00:00:00.000Z',
  }));

  assert.equal(job?.data.requestId, requestId);
  assert.equal(asyncLocalStorage.getStore(), undefined);
  transactionQueue.emit('completed', job, { txHash: 'fixture-hash', ledger: 1 });

  assert.deepEqual(info.mock.calls.map(({ arguments: args }) => args), [
    [{ jobId: 'fixture-job', requestId, type: 'withdrawal' }, 'Transaction enqueued'],
    [{ jobId: 'fixture-job', requestId, txHash: 'fixture-hash' }, 'Transaction job completed'],
  ]);
});
