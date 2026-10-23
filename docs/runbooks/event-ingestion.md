# Event ingestion lag and recovery runbook

The alert labels include the deployment `environment` and Stellar `network`.
Confirm `VAULT_CONTRACT_ID`, `SOROBAN_RPC_URL`, and deployment identity agree
before querying or replaying events.

1. Check `/metrics` for latest observed ledger, last fully processed ledger,
   checkpoint age, and polling/processing failure count. A green HTTP liveness
   probe does not mean the listener is advancing.
2. Inspect the agent logs for Soroban RPC failures, page/cursor errors, database
   insert errors, and event processing failures. Verify database availability
   and the configured network's `getHealth` response.
3. If the listener process restarted, treat events emitted during downtime as
   potentially missing. The current ledger checkpoint is process-local; it is
   not restored from the database on restart.
4. Follow the bounded-history and pagination procedure in
   [`EVENTS.md`](../../EVENTS.md). Deduplicate by event ID, persist before
   advancing the repair checkpoint, and reconcile the repaired ledger window
   against current contract state.
5. If the missing range is older than the RPC provider's `oldestLedger`, use an
   approved archive RPC/event archive. Record any unrecoverable interval and
   the reconciliation evidence in the incident record; do not silently jump
   to the oldest retained ledger.
6. Resume or restart the listener only after the source of the lag is fixed.
   Verify the checkpoint age returns below 60 seconds and ledger lag below 10
   for at least five minutes.

The listener polls every five seconds and paginates each query. Monitoring
metrics are process-local and reset on restart; they do not provide a durable
checkpoint or prove historical completeness by themselves.
