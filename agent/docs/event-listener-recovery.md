# Event listener checkpoint recovery

The listener requires `DATABASE_URL` and checkpoints independently for each `STELLAR_NETWORK` and
`VAULT_CONTRACT_ID`, including the RPC pagination cursor. Apply the Prisma
migration before starting the worker. Checkpoints advance only after relevant
events are processed; empty RPC windows advance through `latestLedger` so idle
ledgers are not polled forever.

When the RPC reports that the checkpoint predates retained history, the worker
sets `recovery_required = true` and emits an `EVENT_HISTORY_EXPIRED` error log
with the requested and oldest available ledger. It resumes at the oldest
available ledger when the RPC supplies one, or at the current latest ledger
when only an expiration error is returned. This signal means operators should
compare the affected ledger range against the chain explorer and the
`vault_events` table before acknowledging recovery:

```sql
SELECT network, contract_id, next_ledger, recovery_required, updated_at
FROM event_listener_checkpoints;
```

After reconciliation, clear the flag for the affected network and contract:

```sql
UPDATE event_listener_checkpoints
SET recovery_required = FALSE, updated_at = NOW()
WHERE network = '<network>' AND contract_id = '<contract-id>';
```

Never move `next_ledger` backwards without first checking `vault_events` for
duplicates. Event IDs are inserted with `ON CONFLICT DO NOTHING`, while alert
handlers should remain idempotent because a worker can crash after processing
an event but before saving its checkpoint.
