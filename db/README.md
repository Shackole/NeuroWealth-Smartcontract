# NeuroWealth PostgreSQL & Supabase Database Schema

PostgreSQL / Supabase schema for tracking user positions, transaction history, yield performance, and audit trails.

## Database Tables
1. `users`: Stores user Stellar address, hashed phone number (PII encrypted), strategy preference, and creation timestamp.
2. `deposits`: Logs deposit transactions, share minting, and transaction hashes.
3. `withdrawals`: Logs withdrawal transactions and share burning.
4. `rebalances`: Off-chain record of AI agent rebalancing events between protocols (Blend / DEX).
5. `yield_snapshots`: Periodic snapshots of total user assets for calculating APY trends and chart rendering.
6. `earnings_history`: Daily aggregated earnings per user.
7. `audit_logs`: Automatic audit log table populated via PostgreSQL trigger on writes.
8. `agent_state`: Key-value JSONB checkpoint store for agent recovery and failover leases (#655, #527).
9. `vault_events`: Idempotent on-chain event ingestion table keyed by `event_id` with `ledger_sequence` and 7-decimal `amount_stroops` / `shares_stroops` (#527).
10. `queued_transactions`: Persistent idempotency ledger (`idempotency_key`, `tx_hash`, `network_passphrase`, `required_role`, `amount_stroops`) preventing duplicate financial actions after Redis/DB interruptions (#527).

## Security & Compliance
- **PII Encryption**: Phone numbers are hashed using SHA-256 with a salt before storing in `phone_hash`.
- **Row-Level Security (RLS)**: Enforces access control rules for Supabase clients so users can only view their own records.
- **Audit Logging**: `log_audit_trail()` trigger captures inserts, updates, and deletes.
- **Realtime Subscriptions**: Enabled via `supabase_realtime` publication for live UI portfolio updates.
