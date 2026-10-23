# Disaster Recovery & Failover Runbook (#655)

For the staging Redis/database interruption drill and evidence record, see
[`STAGING_RECOVERY_EXERCISE.md`](STAGING_RECOVERY_EXERCISE.md).

Maximum acceptable downtime (**RTO**): **5 minutes**.
Recovery point objective (**RPO**): last agent state backup (default: every
heartbeat, ≤ 15 s stale).

## Architecture

Two cooperating modules in `agent/src/`:

- **`stateBackup.ts`** — pluggable state persistence. `StateBackupManager`
  snapshots agent state (`AgentState`: last ledger processed, scheduler
  position, metrics, protocol allocations) to one or more `StateStore`s:
  - `FileStateStore` — local JSON file (dev / last-resort).
  - `PostgresStateStore` — Supabase/Postgres (primary production store).
  - `S3StateStore` — S3-compatible object storage (cross-region copy).
  - `MultiStateStore` — fans out saves to all stores and falls back across
    them on load (a dead store never blocks a save).
- **`failover.ts`** — lease-based hot standby. The primary writes heartbeats
  to the shared store every 15 s (TTL 60 s). Standbys poll; when the lease
  goes stale, a standby promotes itself, restores the latest backup via
  `onPromote`, and resumes. Two standbys racing on a dead primary converge
  via the deterministic tie-break (lowest `agentId` wins the lease).

Worst-case detection + promotion ≈ 60 s TTL + poll interval (7.5 s) ≪ 5 min.

**Deployment limitation:** the repository defines these state backup and
failover modules, but `agent/src` does not currently instantiate
`StateBackupManager` or wire it into the service lifecycle. The RPO and restore
behavior below are design targets until a deployed build has explicit wiring
and an observed backup. PostgreSQL backups do not by themselves prove that
agent state is recoverable.

## Health monitoring

- `GET /health` (metrics API, `metricsApi.ts`) returns `200 {status:
  "healthy"}` with a fresh heartbeat or `503 {status: "degraded"}` when the
  heartbeat is stale/unhealthy. Point the load balancer and uptime monitor
  at it.
- `MetricsEngine.recordHeartbeat` feeds uptime %, and `checkAlerts` fires a
  `heartbeat_stale` alert (see `docs/monitoring.md` for alert routing).

## Recovery scenarios

### 1. Agent process crash (server up)

Systemd/Docker restarts the process → `FailoverManager.bootstrap()` runs:
the lease is fresh (its own, unexpired) → re-acquires, restores the last
state backup, resumes. Expected downtime: seconds.

### 2. Agent server down (crash, cloud zone outage)

Standby detects a stale lease within ~60 s, promotes itself, restores state
from the store, resumes scheduling. Expected downtime: **< 90 s**.

### 3. Agent key compromised

Do **not** let a standby auto-promote with the same key.
1. Pause the scheduler on all instances (`SIGSTOP` or kill).
2. Follow `docs/AGENT_KEY_COMPROMISE_RUNBOOK.md` to rotate the agent key
   (on-chain `update_agent` timelock if the vault key is affected).
3. Start the replacement agent with the new key; it bootstraps and restores
   state like any standby.

### 4. State store outage (Supabase/S3 down)

`MultiStateStore` keeps saving to the healthy stores; the agent continues.
Restore order on boot is the store list order. Alerts fire on save failures
— re-provision the store, then run a manual `StateBackupManager.backup()`.

### 5. Split brain (two primaries)

Cannot happen under normal operation: a standby only promotes when the lease
is stale, and the `agentId` tie-break resolves races. If it is ever suspected
(manual edits, clock skew), stop both, delete the lease key, fix clocks, and
let one instance bootstrap before starting the second.

### 6. Simultaneous Redis queue and database interruption (#527)

When both the Redis transaction queue and PostgreSQL/Supabase database
experience an interruption, `ServiceRecoveryOrchestrator`
(`agent/src/serviceRecovery.ts`) executes a gated 4-phase recovery sequence:

1. **Reconnect & network verification**: verifies Redis and PostgreSQL
   connectivity and asserts that the Soroban RPC `networkPassphrase` matches
   the configured environment (`"Test SDF Network ; September 2015"` or
   `"Public Global Stellar Network ; Stellar Development Foundation"`).
2. **Checkpoint restoration & event backfill**: restores `lastLedger` from
   `agent_state` / `StateBackupManager`, queries missed Soroban contract
   events in `[checkpointLedger + 1, chainLatestLedger]`, and inserts them
   idempotently into `vault_events`.
3. **Queued financial action deduplication**: cross-checks every pending or
   `in_flight` job (`amountStroops` in 7-decimal USDC stroops,
   `requiredRole` in `'user' | 'agent' | 'owner'`) against Redis processed
   keys, PostgreSQL `queued_transactions`, and on-chain confirmed transactions
   by deterministic `idempotencyKey`. Already-confirmed actions are marked
   `skipped_duplicate` and never re-executed.
4. **Chain accounting reconciliation & data-gap gate**: compares on-chain
   `total_assets` / `total_shares` (in stroops) against indexed database
   totals. Any unresolved data gap (`missing_ledger_events`,
   `accounting_mismatch`, `ambiguous_inflight_tx`, `network_mismatch`, or
   `authorization_violation`) blocks declaring recovery complete
   (`recoveryComplete: false`, `workerResumed: false`).

Run the controlled staging rehearsal at any time with:

```bash
./scripts/rehearse-service-recovery.sh
```

See [`infra/README.md`](../infra/README.md) for the full architecture boundary
ownership matrix and recorded recovery timing log.

## Procedures

**Manual state restore**: start the agent with the shared store configured;
it restores automatically. To inspect a backup:
`StateBackupManager.restore()` returns the versioned record and rejects
mismatches against `AGENT_STATE_VERSION`.

**Forced failover drill** (recommended monthly):
1. Kill the primary (`kill -9`).
2. Watch the standby log for `Acquired primary lease` — must appear within
   90 s.
3. Verify `GET /health` on the standby returns `200`.
4. Verify the last ledger processed continues monotonically (no double
   processing of deposits).

**Alert thresholds**: heartbeat stale > 5 min pages on-call; failed
heartbeat writes alert immediately (`logger.error` + alert engine).
