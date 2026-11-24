import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import Module from 'node:module';
import { getListenerHealth } from '../healthState';

test('recovers listener transport and processing health independently', async () => {
  const previousVault = process.env.VAULT_CONTRACT_ID;
  const previousDatabase = process.env.DATABASE_URL;
  process.env.VAULT_CONTRACT_ID = 'fixture-vault';
  process.env.DATABASE_URL = 'fixture-database';
  const rpc = { getLatestLedger: mock.fn<() => Promise<unknown>>(), getEvents: mock.fn<() => Promise<unknown>>() };
  const pool = { query: mock.fn<() => Promise<unknown>>() };
  const dependencies: Record<string, unknown> = {
    './db': { pool },
    './yieldComparison': {},
    './alertEngine': { processEventForAlerts: async () => {} },
    './logger': { info() {}, warn() {}, error() {} },
    './retry': { withRetry: (operation: () => Promise<unknown>) => operation() },
    './rpcClient': {
      getRpcServer: () => rpc,
      rpcCall: (operation: (server: typeof rpc) => unknown) => operation(rpc),
    },
  };
  const loader = Module as unknown as {
    _load(request: string, parent: NodeModule, isMain: boolean): unknown;
  };
  const load = loader._load;
  const listenerPath = require.resolve('../eventListener');
  const stub = mock.method(loader, '_load', function (request, parent, isMain) {
    return parent?.filename === listenerPath && Object.hasOwn(dependencies, request)
      ? dependencies[request]
      : load.call(this, request, parent, isMain);
  });
  const { startEventListener, stopEventListener } = require('../eventListener');
  stub.mock.restore();
  let poll!: () => Promise<void>;
  const interval = mock.method(globalThis, 'setInterval', (callback: () => Promise<void>) => {
    poll = callback;
    return -1 as unknown as NodeJS.Timeout;
  });
  const page = {
    latestLedger: 100,
    events: [{ id: 'fixture-event', ledger: 100, topic: ['withdraw'] }],
  };

  try {
    rpc.getLatestLedger.mock.mockImplementationOnce(async () => { throw new Error('startup outage'); });
    rpc.getLatestLedger.mock.mockImplementation(async () => ({ sequence: 100 }));
    await startEventListener();
    assert.deepEqual(getListenerHealth(), { transport: 'error', processing: 'unknown' });

    rpc.getEvents.mock.mockImplementationOnce(async () => page);
    pool.query.mock.mockImplementationOnce(async () => { throw new Error('storage outage'); });
    await poll();
    assert.deepEqual(getListenerHealth(), { transport: 'ok', processing: 'error' });

    rpc.getEvents.mock.mockImplementationOnce(async () => { throw new Error('poll outage'); });
    await poll();
    assert.deepEqual(getListenerHealth(), { transport: 'error', processing: 'error' });

    rpc.getEvents.mock.mockImplementationOnce(async () => page);
    pool.query.mock.mockImplementationOnce(async () => { throw new Error('storage still unavailable'); });
    await poll();
    assert.deepEqual(getListenerHealth(), { transport: 'ok', processing: 'error' });

    rpc.getEvents.mock.mockImplementationOnce(async () => page);
    pool.query.mock.mockImplementationOnce(async () => ({}));
    await poll();
    assert.deepEqual(getListenerHealth(), { transport: 'ok', processing: 'ok' });

    rpc.getEvents.mock.mockImplementationOnce(async () => { throw new Error('poll outage'); });
    await poll();
    assert.deepEqual(getListenerHealth(), { transport: 'error', processing: 'ok' });
  } finally {
    stopEventListener();
    interval.mock.restore();
    if (previousVault === undefined) delete process.env.VAULT_CONTRACT_ID;
    else process.env.VAULT_CONTRACT_ID = previousVault;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabase;
  }
});
