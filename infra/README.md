# NeuroWealth Infrastructure & Service Recovery Guide (`infra/`)

This directory documents the infrastructure architecture, service recovery orchestration, and staging rehearsal procedures for NeuroWealth's Stellar/Soroban vault platform (**Issue #527**).

---

## 1. Current Behavior & Component Inspection

| Component | File / Module | Direct Callers / Consumers | Role in Service Recovery |
| :--- | :--- | :--- | :--- |
| **Service Recovery Coordinator** | [`agent/src/serviceRecovery.ts`](../agent/src/serviceRecovery.ts) | `scripts/rehearse-service-recovery.sh`, `agent/src/serviceRecovery.test.ts`, agent startup | Orchestrates Redis + PostgreSQL reconnect, checkpoint restoration, missed-ledger backfill, queued transaction deduplication, chain accounting reconciliation, and data-gap gating. |
| **State Backup Manager** | [`agent/src/stateBackup.ts`](../agent/src/stateBackup.ts) | `agent/src/failover.ts`, `agent/src/serviceRecovery.ts` | Persists versioned `AgentState` (`lastLedger`, scheduler state, TVL/allocations) across `PostgresStateStore` (`agent_state` table), `S3StateStore`, and `FileStateStore` via `MultiStateStore`. |
| **Failover Manager** | [`agent/src/failover.ts`](../agent/src/failover.ts) | Agent primary/standby worker loop | Writes 15 s primary heartbeats (60 s TTL) to the shared store; promotes standby with deterministic lowest-`agentId` tie-breaking and restores the latest state backup via `onPromote`. |
| **Soroban Event Listener** | [`agent/src/eventListener.ts`](../agent/src/eventListener.ts) | `agent/src/index.ts`, `ServiceRecoveryOrchestrator` | Polls Soroban RPC `getEvents` from `checkpointLedger + 1`, tracks `lastProcessedLedger`, and writes idempotently to `vault_events` (`ON CONFLICT DO NOTHING`). |
| **Rebalance Scheduler** | [`agent/src/scheduler.ts`](../agent/src/scheduler.ts) | Agent worker loop | Priority queue (`utilization_spike` > `tvl_change` > `manual` > `scheduled`) with gas ceiling and consecutive-failure circuit breaker. |
| **Database Schema** | [`db/schema.sql`](../db/schema.sql) | `agent/src/db.ts`, Supabase migrations | Stores `users`, `deposits`, `withdrawals`, `rebalances`, `vault_events`, `agent_state`, and `queued_transactions` with unique `tx_hash` and `idempotency_key` constraints. |

---

## 2. Ownership Boundaries, Monetary Units, Network Identity & Authorization

### Ownership Boundaries

1. **Contract Boundary (`neurowealth-vault/contracts/vault/src/lib.rs`)**
   - Holds canonical on-chain state (`TotalAssets`, `TotalShares`, `Shares(user)`, `CurrentProtocol`, `LastRebalanceLedger`).
   - Enforces atomic Checks-Effects-Interactions (CEI), `MinRebalanceInterval` cooldowns, and pause gates (`VaultError::Paused` = `#35`).
2. **Service & Worker Boundary (`agent/src/`)**
   - Owns the Redis job queue, PostgreSQL index (`vault_events`, `queued_transactions`, `agent_state`), and Soroban transaction submission.
   - **Invariant 1 (No Duplicate Financial Actions):** Every financial job carries a deterministic `idempotencyKey = sha256(networkPassphrase : contractId : action : authorizedActor : amountStroops : ledgerCheckpoint)`. Before any queued job executes after a Redis/DB outage, it is cross-checked against Redis processed keys, PostgreSQL `queued_transactions`/`deposits`/`withdrawals`/`rebalances`, and confirmed Soroban on-chain events. Any already-confirmed action is marked `skipped_duplicate` and never re-submitted.
   - **Invariant 2 (Data-Gap Gate):** If any ledger in `[checkpointLedger + 1, chainLatestLedger]` cannot be fetched, if an `in_flight` transaction has ambiguous finality, or if `onChainTotalAssetsStroops != dbTotalAssetsStroops` (or shares diverge) after event backfill, recovery halts with `status: 'blocked_by_data_gaps'`, `recoveryComplete: false`, and `workerResumed: false`.
3. **User Interface Boundary (`frontend/`, `packages/vault-ui/`, `whatsapp/`)**
   - Consumes `/health` (`200` when healthy/recovered, `503` when degraded or blocked on data gaps) and `/api/metrics/snapshot`.
   - Displays balances converted from 7-decimal stroops to human-readable USDC (`1 USDC = 10,000,000 stroops`).

### Monetary Units, Network Identity & Authorization Matrix

| Dimension | Specification | Enforcement Point |
| :--- | :--- | :--- |
| **Monetary Unit** | **7-decimal USDC stroops** (`1 USDC = 10,000,000 stroops`). On-chain: `i128` stroops. Database: `BIGINT` (`amount_stroops`) and `NUMERIC(30, 7)`. | `STROOPS_PER_USDC = 10_000_000` in `agent/src/serviceRecovery.ts`; fractional or negative stroop amounts are rejected with `accounting_mismatch`. |
| **Network Identity** | Staging/Testnet: `"Test SDF Network ; September 2015"`<br>Mainnet: `"Public Global Stellar Network ; Stellar Development Foundation"` | `validateQueuedTransaction()` and `ServiceRecoveryOrchestrator.runRecovery()` verify both RPC network passphrase and per-job `networkPassphrase` + `contractId`. |
| **User Authorization** | `deposit`, `withdraw`, `withdraw_all` require `user.require_auth()` (`requiredRole: 'user'`). | Contract entrypoint + `REQUIRED_AUTH_BY_ACTION` check before worker execution. |
| **Agent Authorization** | `rebalance`, `harvest`, `update_total_assets` require `agent.require_auth()` (`requiredRole: 'agent'`). | Contract entrypoint + `REQUIRED_AUTH_BY_ACTION` check before worker execution. |
| **Owner Authorization** | `pause`, `unpause`, `set_caps`, `schedule_upgrade` require `owner.require_auth()` (`requiredRole: 'owner'`). | Cold/multisig owner key only; never stored in agent worker environment. |

---

## 3. Controlled Staging Recovery Rehearsal Procedure (#527)

### Prerequisites

- Node.js >= 20 and `npm ci` completed in `agent/`.
- Isolated staging/testnet configuration (no production credentials required).

### Execution Command

Run the automated staging recovery rehearsal from the repository root:

```bash
./scripts/rehearse-service-recovery.sh
```

Or run the unit and rehearsal test suite directly in `agent/`:

```bash
cd agent
npm test
```

### Rehearsal Scenarios Validated

1. **Scenario 1 — Queued Transaction Deduplication & Event Checkpoint Backfill**
   - **Setup:** Redis and PostgreSQL experience a simulated 12.4 s interruption at ledger `50,100` while chain advances to `50,105`.
   - **Queue State:**
     - `job_deposit_250_usdc` (`2,500,000,000` stroops = 250 USDC, `in_flight`) — already landed on-chain at ledger `50,102` (`0xtx_deposit_250_onchain`).
     - `job_rebalance_500_usdc` (`5,000,000,000` stroops = 500 USDC, `queued`) — already committed in PostgreSQL prior to interruption (`0xtx_rebalance_500_committed`).
     - `job_deposit_250_usdc_retry_dup` (`2,500,000,000` stroops, `queued`) — duplicate retry enqueued before crash.
     - `job_rebalance_100_usdc_pending` (`1,000,000,000` stroops = 100 USDC, `queued`) — unexecuted valid job.
   - **Expected Result:** The 3 already-executed/duplicate jobs are marked `skipped_duplicate` and prevented from re-executing; missed ledger event `evt_50102_deposit_250` is backfilled; `job_rebalance_100_usdc_pending` executes exactly once; on-chain and DB totals match (`12,500,000,000` stroops = 1,250 USDC); `recoveryComplete: true`.
2. **Scenario 2 — Unresolved Data Gap Blocks Recovery Completion**
   - **Setup:** Chain advances to ledger `50,110` with a `750,000,000` stroop (75 USDC) deposit at ledger `50,108`, but RPC event fetch reports ledger `50,108` as missing (`missingLedgers: [50108]`).
   - **Expected Result:** `ServiceRecoveryOrchestrator` detects both `missing_ledger_events` and `accounting_mismatch` (`assetsDeltaStroops: 750000000`), sets `status: 'blocked_by_data_gaps'`, `recoveryComplete: false`, and `workerResumed: false`.
3. **Scenario 3 — Gap Resolution & Clean Completion**
   - **Setup:** Missing ledger `50,108` event (`evt_50108_deposit_75`) becomes available and is backfilled.
   - **Expected Result:** On-chain and DB totals reconcile (`13,250,000,000` stroops = 1,325 USDC, `assetsDeltaStroops: 0`), `unresolvedGaps` is empty, checkpoint advances to `50,110`, and `recoveryComplete: true`.

---

## 4. Recorded Recovery Timing & Evidence Log

Evidence artifact generated by `./scripts/rehearse-service-recovery.sh`:
[`infra/recovery-rehearsal-evidence.json`](recovery-rehearsal-evidence.json)

| Phase / Metric | Scenario 1 (Dedupe + Backfill) | Scenario 2 (Blocked on Gap) | Scenario 3 (Post-Gap Resolution) | Target / SLA |
| :--- | :--- | :--- | :--- | :--- |
| **Outage Detection to Recovery Start** | `12,400 ms` | `8,200 ms` | `3,500 ms` | `≤ 60,000 ms` (lease TTL) |
| **Redis Reconnect (`redisReconnectDurationMs`)** | `180 ms` | `140 ms` | `140 ms` | `≤ 5,000 ms` |
| **DB Reconnect (`dbReconnectDurationMs`)** | `240 ms` | `190 ms` | `190 ms` | `≤ 5,000 ms` |
| **Checkpoint Restore (`checkpointRestoreDurationMs`)** | `95 ms` | `80 ms` | `80 ms` | `≤ 5,000 ms` |
| **Event Backfill (`eventBackfillDurationMs`)** | `430 ms` | `260 ms` | `360 ms` | `≤ 30,000 ms` |
| **Queue Deduplication (`queueDeduplicationDurationMs`)** | `150 ms` | `0 ms` | `0 ms` | `≤ 10,000 ms` |
| **Chain Reconciliation (`chainReconciliationDurationMs`)** | `110 ms` | `90 ms` | `90 ms` | `≤ 10,000 ms` |
| **Worker Restart (`workerRestartDurationMs`)** | `505 ms` | `0 ms` (blocked) | `70 ms` | `≤ 10,000 ms` |
| **Total Recovery Duration (`totalRecoveryDurationMs`)** | **`14,110 ms` (14.11 s)** | **`8,960 ms` (halted)** | **`4,430 ms` (4.43 s)** | **`≤ 300,000 ms` (5 min RTO)** |
| **Recovery Complete (`recoveryComplete`)** | `true` | `false` (blocked) | `true` | Gate enforced |
