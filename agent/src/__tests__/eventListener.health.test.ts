import { getListenerHealth } from '../healthState';

jest.mock('../db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../yieldComparison', () => ({ evaluateYield: jest.fn() }));
jest.mock('../alertEngine', () => ({ processEventForAlerts: jest.fn() }));
jest.mock('../logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../retry', () => ({ withRetry: (operation: () => Promise<unknown>) => operation() }));
jest.mock('../rpcClient', () => {
  const server = { getLatestLedger: jest.fn(), getEvents: jest.fn() };
  return { getRpcServer: () => server, rpcCall: (operation: (rpc: typeof server) => unknown) => operation(server) };
});

it('recovers listener transport and processing health independently', async () => {
  jest.useFakeTimers();
  const previousVault = process.env.VAULT_CONTRACT_ID;
  const previousDatabase = process.env.DATABASE_URL;
  process.env.VAULT_CONTRACT_ID = 'fixture-vault';
  process.env.DATABASE_URL = 'fixture-database';
  const { startEventListener, stopEventListener } = require('../eventListener');
  const { getRpcServer } = require('../rpcClient');
  const { pool } = require('../db');
  const rpc = getRpcServer();
  const page = {
    latestLedger: 100,
    events: [{ id: 'fixture-event', ledger: 100, topic: ['withdraw'] }],
  };
  const poll = () => jest.advanceTimersByTimeAsync(5000);

  try {
    rpc.getLatestLedger.mockRejectedValueOnce(new Error('startup outage'))
      .mockResolvedValue({ sequence: 100 });
    await startEventListener();
    expect(getListenerHealth()).toEqual({ transport: 'error', processing: 'unknown' });

    rpc.getEvents.mockResolvedValueOnce(page);
    pool.query.mockRejectedValueOnce(new Error('storage outage'));
    await poll();
    expect(getListenerHealth()).toEqual({ transport: 'ok', processing: 'error' });

    rpc.getEvents.mockRejectedValueOnce(new Error('poll outage'));
    await poll();
    expect(getListenerHealth()).toEqual({ transport: 'error', processing: 'error' });

    rpc.getEvents.mockResolvedValueOnce(page);
    pool.query.mockRejectedValueOnce(new Error('storage still unavailable'));
    await poll();
    expect(getListenerHealth()).toEqual({ transport: 'ok', processing: 'error' });

    rpc.getEvents.mockResolvedValueOnce(page);
    pool.query.mockResolvedValueOnce({});
    await poll();
    expect(getListenerHealth()).toEqual({ transport: 'ok', processing: 'ok' });

    rpc.getEvents.mockRejectedValueOnce(new Error('poll outage'));
    await poll();
    expect(getListenerHealth()).toEqual({ transport: 'error', processing: 'ok' });
  } finally {
    stopEventListener();
    jest.useRealTimers();
    if (previousVault === undefined) delete process.env.VAULT_CONTRACT_ID;
    else process.env.VAULT_CONTRACT_ID = previousVault;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabase;
  }
});
