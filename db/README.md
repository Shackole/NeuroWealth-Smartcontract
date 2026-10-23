# NeuroWealth PostgreSQL & Supabase Database Schema

PostgreSQL / Supabase schema for tracking user positions, transaction history, yield performance, and audit trails.

## Migration ownership and release order

`supabase/migrations/` is the authoritative change history for databases managed
by Supabase. Apply its timestamped SQL files in lexical (timestamp) order with
the repository's Supabase deployment workflow. Never apply `db/schema.sql` as
an upgrade to an existing environment: it is a standalone bootstrap snapshot
for a new local database and a reviewable schema reference. It does not include
all later objects or migration-only changes, so it is not a substitute for the
migration ledger.

The current history is:

1. `20260728000000_init_neurowealth_schema.sql` creates the initial user,
   deposit, withdrawal, rebalance, yield, earnings, and audit tables.
2. `20260926000000_add_transactions_apy_snapshots.sql` adds transaction and
   APY history, updates user strategy fields, and adjusts audit/RLS/realtime
   configuration.
3. `20260926000001_rebalance_failures.sql` adds rebalance failure records.

For a fresh local database, bootstrap from `db/schema.sql` only when the
application needs the tables in that snapshot. For a fresh Supabase project,
apply the complete migration history; do not bootstrap from the snapshot and
then replay migrations unless the migration ledger and resulting schema have
been deliberately reconciled. Before release, inspect the migration status,
review the pending SQL in order, and compare the target schema with the
expected post-migration schema. Record the applied migration versions for the
release.

## Rollback and destructive changes

Do not edit a migration that has been applied to a shared environment. Add a
new forward migration instead. Prefer additive, reversible steps; for a
destructive change, first take and verify a restorable database backup, record
the affected rows/columns and recovery owner, and provide a restore or data
reconstruction plan. A rollback script alone cannot restore deleted data.
Practice the recovery on an isolated copy before production and stop the
release if the recovery evidence is missing.

Keep `db/schema.sql` synchronized as a bootstrap snapshot when tables or
constraints change. Review its differences against the ordered migration
result; do not treat differences as permission to rewrite migration history.

## Database Tables
1. `users`: Stores user Stellar address, hashed phone number (PII encrypted), strategy preference, and creation timestamp.
2. `deposits`: Logs deposit transactions, share minting, and transaction hashes.
3. `withdrawals`: Logs withdrawal transactions and share burning.
4. `rebalances`: Off-chain record of AI agent rebalancing events between protocols (Blend / DEX).
5. `yield_snapshots`: Periodic snapshots of total user assets for calculating APY trends and chart rendering.
6. `earnings_history`: Daily aggregated earnings per user.
7. `audit_logs`: Automatic audit log table populated via PostgreSQL trigger on writes.

## Security & Compliance
- **PII Encryption**: Phone numbers are hashed using SHA-256 with a salt before storing in `phone_hash`.
- **Row-Level Security (RLS)**: Enforces access control rules for Supabase clients so users can only view their own records.
- **Audit Logging**: `log_audit_trail()` trigger captures inserts, updates, and deletes.
- **Realtime Subscriptions**: Enabled via `supabase_realtime` publication for live UI portfolio updates.
