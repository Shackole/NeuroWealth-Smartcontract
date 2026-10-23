import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ChainRpcRecoveryAdapter,
  ChainVaultEvent,
  DatabaseRecoveryAdapter,
  DEFAULT_RTO_BUDGET_MS,
  QueuedFinancialTransaction,
  RedisQueueAdapter,
  ServiceRecoveryOrchestrator,
  STELLAR_NETWORK_PASSPHRASES,
  STROOPS_PER_USDC,
  computeIdempotencyKey,
  runControlledStagingRehearsal,
  validateQueuedTransaction,
} from './serviceRecovery';
import { StateBackupManager, StateStore } from './stateBackup';

const TEST_NETWORK = STELLAR_NETWORK_PASSPHRASES.testnet;
const TEST_CONTRACT = 'CBVAULT527TESTCONTRACT0000000000000000000000000000000000';
const TEST_USER = 'GUSERTEST52700000000000000000000000000000000000000000000';
const TEST_AGENT = 'GAGENTTEST5270000000000000000000000000000000000000000000';

function makeJob(overrides: Partial<QueuedFinancialTransaction> = {}): QueuedFinancialTransaction {
  const base = {
    jobId: 'job_1',
    action: 'rebalance' as const,
    amountStroops: 100 * STROOPS_PER_USDC,
    assetSymbol: 'USDC' as const,
    networkPassphrase: TEST_NETWORK,
    contractId: TEST_CONTRACT,
    authorizedActor: TEST_AGENT,
    requiredRole: 'agent' as const,
    ledgerCheckpoint: 1_000,
    enqueuedAt: 1_700_000_000_000,
    status: 'queued' as const,
    ...overrides,
  };
  return {
    ...base,
    idempotencyKey:
      overrides.idempotencyKey ??
      computeIdempotencyKey({
        networkPassphrase: base.networkPassphrase,
        contractId: base.contractId,
        action: base.action,
        authorizedActor: base.authorizedActor,
        amountStroops: base.amountStroops,
        ledgerCheckpoint: base.ledgerCheckpoint,
      }),
  };
}

function makeHarness() {
  let clock = 1_700_000_010_000;
  const jobs: QueuedFinancialTransaction[] = [];
  const redisProcessed = new Set<string>();
  const dbIdemKeys = new Set<string>();
  const dbTxHashes = new Set<string>();
  const indexedEvents = new Map<string, ChainVaultEvent>();
  const onChainConfirmed = new Map<string, string>();
  const executedJobs: QueuedFinancialTransaction[] = [];

  let dbCheckpoint: number | null = 1_000;
  let chainLatestLedger = 1_005;
  let dbAssetsStroops = 500 * STROOPS_PER_USDC;
  let dbSharesStroops = 500 * STROOPS_PER_USDC;
  let chainAssetsStroops = 500 * STROOPS_PER_USDC;
  let chainSharesStroops = 500 * STROOPS_PER_USDC;
  let chainEvents: ChainVaultEvent[] = [];
  let missingLedgers: number[] = [];
  let chainNetwork: string = TEST_NETWORK;
  let workerResumedAtLedger: number | null = null;

  const redis: RedisQueueAdapter = {
    ping: async () => {
      clock += 50;
      return true;
    },
    getPendingJobs: async () => jobs,
    getProcessedIdempotencyKeys: async () => redisProcessed,
    markJobStatus: async (jobId, status, txHash) => {
      const target = jobs.find((j) => j.jobId === jobId);
      if (target) {
        target.status = status;
        if (txHash) target.txHash = txHash;
      }
    },
    recordIdempotencyKey: async (key) => {
      redisProcessed.add(key);
    },
  };

  const db: DatabaseRecoveryAdapter = {
    ping: async () => {
      clock += 70;
      return true;
    },
    getCheckpointLedger: async () => {
      clock += 30;
      return dbCheckpoint;
    },
    saveCheckpointLedger: async (ledger) => {
      dbCheckpoint = ledger;
    },
    insertIndexedEvent: async (evt) => {
      clock += 40;
      if (indexedEvents.has(evt.eventId)) return false;
      indexedEvents.set(evt.eventId, evt);
      if (evt.eventType === 'deposit') {
        dbAssetsStroops += evt.amountStroops;
        dbSharesStroops += evt.sharesStroops;
      } else if (evt.eventType === 'withdraw') {
        dbAssetsStroops -= evt.amountStroops;
        dbSharesStroops -= evt.sharesStroops;
      }
      return true;
    },
    getRecordedIdempotencyKeys: async () => dbIdemKeys,
    getRecordedTxHashes: async () => dbTxHashes,
    recordExecutedTransaction: async (tx, txHash) => {
      dbIdemKeys.add(tx.idempotencyKey);
      dbTxHashes.add(txHash);
    },
    getAccountingTotals: async () => {
      clock += 35;
      return { totalAssetsStroops: dbAssetsStroops, totalSharesStroops: dbSharesStroops };
    },
  };

  const chain: ChainRpcRecoveryAdapter = {
    getNetworkPassphrase: async () => chainNetwork,
    getLatestLedger: async () => chainLatestLedger,
    getVaultEvents: async () => {
      clock += 110;
      return { events: chainEvents, missingLedgers };
    },
    getOnChainVaultTotals: async () => ({
      totalAssetsStroops: chainAssetsStroops,
      totalSharesStroops: chainSharesStroops,
      paused: false,
    }),
    getConfirmedTransactionsByIdempotencyKey: async () => {
      clock += 60;
      return onChainConfirmed;
    },
  };

  const createOrchestrator = (outageDetectedAtMs = 1_700_000_000_000, stateBackup?: StateBackupManager) =>
    new ServiceRecoveryOrchestrator(
      {
        expectedNetworkPassphrase: TEST_NETWORK,
        contractId: TEST_CONTRACT,
        rtoBudgetMs: DEFAULT_RTO_BUDGET_MS,
        outageDetectedAtMs,
      },
      {
        redis,
        db,
        chain,
        stateBackup,
        now: () => clock,
        executeFinancialAction: async (tx) => {
          clock += 150;
          executedJobs.push(tx);
          return { txHash: `0xexec_${tx.jobId}` };
        },
        onWorkerResume: async (ledger) => {
          clock += 25;
          workerResumedAtLedger = ledger;
        },
      },
    );

  return {
    getClock: () => clock,
    setClock: (v: number) => {
      clock = v;
    },
    jobs,
    redisProcessed,
    dbIdemKeys,
    dbTxHashes,
    onChainConfirmed,
    executedJobs,
    setDbCheckpoint: (v: number | null) => {
      dbCheckpoint = v;
    },
    getDbCheckpoint: () => dbCheckpoint,
    setChainLatestLedger: (v: number) => {
      chainLatestLedger = v;
    },
    setAccounting: (dbA: number, dbS: number, chainA: number, chainS: number) => {
      dbAssetsStroops = dbA;
      dbSharesStroops = dbS;
      chainAssetsStroops = chainA;
      chainSharesStroops = chainS;
    },
    setChainEvents: (evts: ChainVaultEvent[], missing: number[] = []) => {
      chainEvents = evts;
      missingLedgers = missing;
    },
    setChainNetwork: (net: string) => {
      chainNetwork = net;
    },
    getWorkerResumedAtLedger: () => workerResumedAtLedger,
    createOrchestrator,
  };
}

describe('Service recovery after Redis and database interruption (Issue #527)', () => {
  it('Criterion 1: recovered services do not duplicate financial actions across Redis, DB, chain, or batch duplicates', async () => {
    const h = makeHarness();

    const jobConfirmedInRedis = makeJob({ jobId: 'job_redis_done', amountStroops: 50 * STROOPS_PER_USDC });
    h.redisProcessed.add(jobConfirmedInRedis.idempotencyKey);

    const jobConfirmedInDb = makeJob({
      jobId: 'job_db_done',
      amountStroops: 75 * STROOPS_PER_USDC,
      ledgerCheckpoint: 1_001,
      txHash: '0xdb_committed_hash',
    });
    h.dbTxHashes.add('0xdb_committed_hash');

    const jobConfirmedOnChain = makeJob({
      jobId: 'job_chain_done',
      action: 'deposit',
      authorizedActor: TEST_USER,
      requiredRole: 'user',
      amountStroops: 200 * STROOPS_PER_USDC,
      ledgerCheckpoint: 1_002,
      status: 'in_flight',
    });
    h.onChainConfirmed.set(jobConfirmedOnChain.idempotencyKey, '0xchain_confirmed_hash');

    const jobFresh = makeJob({
      jobId: 'job_fresh_1',
      amountStroops: 300 * STROOPS_PER_USDC,
      ledgerCheckpoint: 1_004,
    });
    const jobFreshDuplicateInQueue = {
      ...jobFresh,
      jobId: 'job_fresh_1_dup_retry',
    };

    h.jobs.push(
      jobConfirmedInRedis,
      jobConfirmedInDb,
      jobConfirmedOnChain,
      jobFresh,
      jobFreshDuplicateInQueue,
    );

    const report = await h.createOrchestrator().runRecovery();

    assert.strictEqual(report.recoveryComplete, true);
    assert.strictEqual(report.status, 'recovered');
    assert.strictEqual(h.executedJobs.length, 1);
    assert.strictEqual(h.executedJobs[0].jobId, 'job_fresh_1');
    assert.deepStrictEqual(report.queueSummary.duplicateActionsPrevented, [
      'job_redis_done',
      'job_db_done',
      'job_chain_done',
      'job_fresh_1_dup_retry',
    ]);
    assert.strictEqual(report.queueSummary.executedActions.length, 1);
    assert.strictEqual(report.queueSummary.executedActions[0].jobId, 'job_fresh_1');
    // Confirm the on-chain confirmed job was backfilled into DB idempotency keys
    assert.strictEqual(h.dbIdemKeys.has(jobConfirmedOnChain.idempotencyKey), true);
  });

  it('Criterion 2: measured recovery timing is recorded for every phase and checked against RTO budget', async () => {
    const h = makeHarness();
    const report = await h.createOrchestrator(1_700_000_000_000).runRecovery();

    assert.strictEqual(report.timing.outageDetectedAtMs, 1_700_000_000_000);
    assert.strictEqual(report.timing.recoveryStartedAtMs, 1_700_000_010_000);
    assert.ok(report.timing.redisReconnectDurationMs >= 50);
    assert.ok(report.timing.dbReconnectDurationMs >= 70);
    assert.ok(report.timing.checkpointRestoreDurationMs >= 30);
    assert.ok(report.timing.eventBackfillDurationMs >= 110);
    assert.ok(report.timing.queueDeduplicationDurationMs >= 60);
    assert.ok(report.timing.chainReconciliationDurationMs >= 35);
    assert.ok(report.timing.workerRestartDurationMs >= 25);
    assert.strictEqual(
      report.timing.totalRecoveryDurationMs,
      report.timing.recoveryFinishedAtMs - report.timing.outageDetectedAtMs,
    );
    assert.strictEqual(report.timing.rtoBudgetMs, DEFAULT_RTO_BUDGET_MS);
    assert.strictEqual(report.timing.withinRtoBudget, true);
  });

  it('Criterion 3a: unresolved missing ledger events block declaring recovery complete and prevent financial execution', async () => {
    const h = makeHarness();
    const pendingJob = makeJob({ jobId: 'job_should_not_run' });
    h.jobs.push(pendingJob);

    // Ledger 1003 is missing from RPC backfill
    h.setChainEvents([], [1_003]);

    const report = await h.createOrchestrator().runRecovery();

    assert.strictEqual(report.recoveryComplete, false);
    assert.strictEqual(report.workerResumed, false);
    assert.strictEqual(report.status, 'blocked_by_data_gaps');
    assert.strictEqual(h.executedJobs.length, 0);
    assert.strictEqual(h.getWorkerResumedAtLedger(), null);
    assert.ok(report.unresolvedGaps.some((g) => g.kind === 'missing_ledger_events'));
    assert.deepStrictEqual(report.queueSummary.blockedActions, ['job_should_not_run']);
  });

  it('Criterion 3b: unresolved accounting mismatch between on-chain and DB stroops blocks recovery completion', async () => {
    const h = makeHarness();
    // On-chain has 600 USDC while DB has 500 USDC with no events explaining the 100 USDC gap
    h.setAccounting(
      500 * STROOPS_PER_USDC,
      500 * STROOPS_PER_USDC,
      600 * STROOPS_PER_USDC,
      600 * STROOPS_PER_USDC,
    );

    const report = await h.createOrchestrator().runRecovery();

    assert.strictEqual(report.recoveryComplete, false);
    assert.strictEqual(report.status, 'blocked_by_data_gaps');
    assert.strictEqual(report.accounting.assetsDeltaStroops, 100 * STROOPS_PER_USDC);
    assert.ok(report.unresolvedGaps.some((g) => g.kind === 'accounting_mismatch'));
  });

  it('Criterion 3c: ambiguous in-flight financial transaction without on-chain confirmation blocks recovery', async () => {
    const h = makeHarness();
    const inFlightUnknown = makeJob({
      jobId: 'job_inflight_ambiguous',
      status: 'in_flight',
    });
    h.jobs.push(inFlightUnknown);

    const report = await h.createOrchestrator().runRecovery();

    assert.strictEqual(report.recoveryComplete, false);
    assert.strictEqual(report.status, 'blocked_by_data_gaps');
    assert.strictEqual(h.executedJobs.length, 0);
    assert.ok(report.unresolvedGaps.some((g) => g.kind === 'ambiguous_inflight_tx'));
  });

  it('enforces explicit monetary units, network identity, and authorization role boundaries', async () => {
    const badNetworkJob = makeJob({
      jobId: 'job_wrong_net',
      networkPassphrase: STELLAR_NETWORK_PASSPHRASES.mainnet,
    });
    assert.strictEqual(
      validateQueuedTransaction(badNetworkJob, TEST_NETWORK, TEST_CONTRACT)?.kind,
      'network_mismatch',
    );

    const badAuthJob = makeJob({
      jobId: 'job_wrong_role',
      action: 'rebalance',
      requiredRole: 'user', // rebalance requires 'agent'
    });
    assert.strictEqual(
      validateQueuedTransaction(badAuthJob, TEST_NETWORK, TEST_CONTRACT)?.kind,
      'authorization_violation',
    );

    const badUnitJob = makeJob({
      jobId: 'job_fractional_stroops',
      amountStroops: 12.34, // must be integer stroops
    });
    assert.strictEqual(
      validateQueuedTransaction(badUnitJob, TEST_NETWORK, TEST_CONTRACT)?.kind,
      'accounting_mismatch',
    );
  });

  it('restores checkpoint from StateBackupManager fallback when DB checkpoint is empty and reconciles missed events', async () => {
    const h = makeHarness();
    h.setDbCheckpoint(null);
    h.setAccounting(
      500 * STROOPS_PER_USDC,
      500 * STROOPS_PER_USDC,
      650 * STROOPS_PER_USDC,
      650 * STROOPS_PER_USDC,
    );
    h.setChainEvents([
      {
        eventId: 'evt_1003_dep',
        eventType: 'deposit',
        ledgerSequence: 1_003,
        txHash: '0xdep150',
        actor: TEST_USER,
        amountStroops: 150 * STROOPS_PER_USDC,
        sharesStroops: 150 * STROOPS_PER_USDC,
      },
    ]);

    const memStoreMap = new Map<string, unknown>();
    const memStore: StateStore = {
      save: async (k, v) => {
        memStoreMap.set(k, v);
      },
      load: async (k) => (memStoreMap.get(k) as never) ?? null,
    };
    const backupMgr = new StateBackupManager(memStore, 'agent:state', () => 1_700_000_000_000);
    await backupMgr.backup({
      lastLedger: 1_000,
      lastRebalanceAt: null,
      scheduler: { interval: '4h', lastRunAt: null, consecutiveFailures: 0 },
      metrics: { tvl: 500 * STROOPS_PER_USDC, apy: 0.07, allocations: [] },
    });

    const report = await h.createOrchestrator(1_700_000_000_000, backupMgr).runRecovery();

    assert.strictEqual(report.recoveryComplete, true);
    assert.strictEqual(report.checkpoint.previousLedger, 1_000);
    assert.strictEqual(report.checkpoint.reconciledLedger, 1_005);
    assert.strictEqual(report.checkpoint.backfilledEventCount, 1);
    assert.strictEqual(report.accounting.assetsDeltaStroops, 0);
    assert.strictEqual(backupMgr.getLastState()?.lastLedger, 1_005);
    assert.strictEqual(h.getWorkerResumedAtLedger(), 1_005);
  });

  it('runs the full controlled staging rehearsal covering all acceptance criteria', async () => {
    const summary = await runControlledStagingRehearsal();
    assert.strictEqual(summary.allCriteriaPassed, true);
    assert.strictEqual(summary.scenarios.duplicatePreventionAndBackfill.recoveryComplete, true);
    assert.strictEqual(summary.scenarios.blockedOnUnresolvedDataGap.recoveryComplete, false);
    assert.strictEqual(summary.scenarios.resolvedAfterGapBackfill.recoveryComplete, true);
  });
});
