# Staging Service Recovery Exercise

**Scope:** Redis-backed transaction queues, database state, event checkpoints,
worker restart, and Stellar transaction reconciliation.
**Environment:** staging only, configured for Stellar testnet and disposable
test assets. Never use production credentials or submit a mainnet transaction.

## Safety and readiness gates

- Record the staging service, database, Redis instance, contract ID, RPC URL,
  and network passphrase. Confirm the passphrase identifies testnet.
- Confirm the staging database and Redis snapshots are restorable before
  injecting a fault. Keep the worker and transaction submission endpoint
  isolated from production.
- Seed at least one queued test transaction and record its deduplication key,
  Bull job ID, request timestamp, and any known transaction hash.
- Record UTC start time and the latest reconciled Stellar ledger before the
  interruption. Do not copy secret keys or connection strings into the record.
- Assign one operator to recovery and a second operator to verify ledger and
  database evidence.

## Exercise

1. Record the queue counts and oldest job age from `/api/queue/stats`; record
   the last durable event ledger and latest testnet ledger.
2. Stop the staging worker. Interrupt Redis and the staging database using the
   staging provider controls. Record the time each dependency became
   unavailable.
3. Restore Redis and the database from the snapshots. Keep transaction workers
   stopped while checking queue persistence and database consistency.
4. Start one worker only. Confirm it restores queued jobs and does not enqueue a
   second job with an existing deduplication key.
5. Restart event ingestion from a durable ledger checkpoint. Compare every
   recovered event ID and ledger with the contract's testnet event history.
6. For each submitted transaction, query the testnet RPC/Horizon record by its
   transaction hash before retrying. Treat a timeout with an unknown hash as
   **indeterminate**; do not blindly resubmit it.
7. Reconcile queue state, transaction hashes, event IDs, and the database
   checkpoint. Record when health/readiness first returned and when all
   reconciliation checks passed.

## Completion gate

Recovery is complete only when queued jobs are accounted for exactly once,
every submitted transaction has a confirmed testnet result, event IDs and
ledger ranges have no unexplained gaps, and the recovered checkpoint is at
least the last verified ledger. Any unknown transaction result, missing event
range, or un-restored job blocks completion and requires an incident record.

The current `agent/src/eventListener.ts` initializes its cursor from the latest
ledger in memory and the base `db/schema.sql` does not define a durable event
checkpoint table. Until durable checkpointing is implemented and deployed to
staging, this exercise must record the checkpoint/replay criterion as **blocked**
and must not be reported as a successful recovery drill.

## Evidence record

Leave the observed values blank until an operator runs the drill. Use UTC and
retain only non-secret identifiers.

| Measure | Observed value |
|---------|----------------|
| Exercise date / run ID | |
| Dependency interruption start | |
| Database restored | |
| Redis restored | |
| Worker healthy | |
| Recovery complete (if all gates pass) | |
| Recovery time from interruption to verified recovery | |
| Last verified ledger / recovered checkpoint | |
| Queued jobs accounted for | |
| Testnet transaction hashes reconciled | |
| Event gaps or unresolved items | |

**Current status:** procedure prepared; no staging exercise or recovery timing
has been recorded. See the completion gate before declaring recovery.
