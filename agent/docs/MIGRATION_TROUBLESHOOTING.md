# Prisma Migration Troubleshooting

> **Issue:** #673  
> **Context:** `agent/README.md`  
> **Purpose:** Help maintainers diagnose and recover from failed local Prisma migration
> runs without losing fixture data.

---

## Overview

The NeuroWealth agent uses **Prisma Migrate** backed by a PostgreSQL 15 database.
Migrations run automatically on container start (`prisma migrate deploy`).
When a migration fails locally, the database can enter a partially-applied state that
blocks further development. This guide covers how to identify, inspect, and recover
from those failures safely.

---

## 1. Migration Status

### 1.1 Check which migrations have been applied

```bash
# From the repo root or agent/ directory
docker-compose exec agent npx prisma migrate status
```

The output lists every migration file under `agent/prisma/migrations/` and whether it
has been applied, is pending, or has drifted from the recorded state.

**Example output (healthy):**

```
Environment variables loaded from .env.local
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "neurowealth", schema "public" at "localhost:5432"

4 migrations found in prisma/migrations

✔ 0001_initial_schema
✔ 0002_event_listener_checkpoint
```

**Example output (pending migration):**

```
3 migrations found in prisma/migrations

✔ 0001_initial_schema
✔ 0002_event_listener_checkpoint
✖ 0003_add_rebalance_log           (not yet applied)
```

**Example output (failed migration):**

```
✖ 0003_add_rebalance_log           (migration failed — recorded as FAILED in _prisma_migrations)
```

A `FAILED` row means Prisma recorded the migration as started but the SQL did not
complete cleanly. The `_prisma_migrations` table tracks this state.

### 1.2 Query the migrations table directly

```bash
docker-compose exec postgres psql -U postgres -d neurowealth \
  -c "SELECT migration_name, started_at, finished_at, applied_steps_count, rolled_back_at, failed FROM _prisma_migrations ORDER BY started_at;"
```

The `failed` column is `true` for a migration that did not finish. A non-null
`rolled_back_at` means Prisma attempted a rollback.

---

## 2. Drift Inspection

Schema drift occurs when the live database schema no longer matches what Prisma expects
based on the applied migrations. This can happen after manual `psql` changes, an
interrupted migration, or a partial seed.

### 2.1 Detect drift

```bash
docker-compose exec agent npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@postgres:5432/neurowealth_shadow
```

Prisma spins up a shadow database, applies all migration SQL, then diffs it against
the live database. Any output indicates drift.

**Common drift patterns:**

| Drift symptom | Likely cause |
|---|---|
| `Missing table: rebalance_logs` | A migration was added to `prisma/migrations/` but never ran |
| `Column xyz added to users` | Manual `ALTER TABLE` was run in psql without a migration |
| `Missing index on stellar_address` | Migration `0001` applied before the index was added |
| `Table _prisma_migrations missing` | Database was created without running any migration (empty database) |

### 2.2 Inspect the failing migration SQL

```bash
# View the raw SQL for the failed migration
cat agent/prisma/migrations/0003_add_rebalance_log/migration.sql
```

Look for:
- `ALTER TABLE` statements that reference tables or columns that do not yet exist.
- `CREATE INDEX CONCURRENTLY` (not supported inside a transaction block; Prisma wraps
  migrations in a transaction by default — use `-- @no-transaction` pragma if needed).
- Constraint names that conflict with an existing constraint from an earlier schema change.

---

## 3. Recovery Procedures

### 3.1 Resolve a `FAILED` migration (no data loss)

If the migration failed partway through, the simplest recovery is to mark it as rolled
back, fix the SQL if needed, and re-apply.

```bash
# 1. Mark the failed migration as rolled back in Prisma's tracking table
docker-compose exec agent npx prisma migrate resolve \
  --rolled-back 0003_add_rebalance_log

# 2. Verify the status is now "pending" (not "failed")
docker-compose exec agent npx prisma migrate status

# 3. If the SQL needs fixing, edit the migration file:
#    agent/prisma/migrations/0003_add_rebalance_log/migration.sql
#    Then re-apply:
docker-compose exec agent npx prisma migrate deploy
```

> **Note:** `prisma migrate resolve --rolled-back` only updates the tracking table — it
> does NOT undo any DDL that was already executed. If the migration partially created a
> table, you may need to drop it manually (see §3.3) before re-applying.

### 3.2 Apply a pending migration cleanly

```bash
# Apply all pending migrations
docker-compose exec agent npx prisma migrate deploy

# Or, during active development (creates a migration file and applies it):
docker-compose exec agent npx prisma migrate dev --name describe-your-change
```

### 3.3 Clean up partially-created objects after a failed migration

If the failed migration created a table or index before erroring, you must drop it
before re-applying.

```bash
# Open a psql shell
docker-compose exec postgres psql -U postgres -d neurowealth

-- Example: drop a partially-created table
DROP TABLE IF EXISTS rebalance_logs;

-- Example: drop a conflicting index
DROP INDEX IF EXISTS idx_rebalance_logs_created_at;

\q
```

After dropping the objects, re-run `prisma migrate deploy`.

### 3.4 Full reset (development only — destroys all data)

If the database is in an unrecoverable state and you do not need to preserve local data:

```bash
# Destroy and recreate all database volumes
docker-compose down -v
docker-compose up

# Prisma migrate deploy runs automatically on agent container start
```

> ⚠️ **This deletes all local data**, including seed rows and any test transactions.
> Preserve fixture data first — see §4 below.

---

## 4. Preserving Local Fixture Data During Recovery

If your local database contains fixture data you want to keep (e.g. seed users,
test transaction history, or manual test positions), export it before running any
destructive recovery step.

### 4.1 Dump the entire database

```bash
docker-compose exec postgres pg_dump \
  -U postgres \
  -d neurowealth \
  --no-owner \
  --no-privileges \
  -F plain \
  > /tmp/neurowealth-local-$(date +%Y%m%d%H%M%S).sql

echo "Dump saved to /tmp/neurowealth-local-$(date +%Y%m%d%H%M%S).sql"
```

### 4.2 Dump only specific fixture tables

```bash
docker-compose exec postgres pg_dump \
  -U postgres \
  -d neurowealth \
  --no-owner \
  --no-privileges \
  -F plain \
  --table=users \
  --table=transactions \
  > /tmp/fixtures-$(date +%Y%m%d).sql
```

### 4.3 Restore after recovery

```bash
# After docker-compose up and automatic migration:
docker-compose exec -T postgres psql \
  -U postgres \
  -d neurowealth \
  < /tmp/fixtures-<date>.sql
```

> **Caveat:** If the schema changed between the dump and the restore (e.g. a new
> `NOT NULL` column was added), the restore may fail. In that case, adjust the dump
> SQL to include the new column's default value, or restore only the compatible rows.

### 4.4 Use the Prisma seed script for reproducible fixture data

For repeatable test data, prefer the seed script over manual dumps:

```bash
docker-compose exec agent npx prisma db seed
# Runs agent/prisma/seed.ts — creates the standard development fixture set
```

Add any custom fixtures to `agent/prisma/seed.ts` so they survive a full reset.

---

## 5. Diagnostic Quick Reference

| Symptom | First command | Likely cause |
|---|---|---|
| Agent fails to start with `migrate deploy` error | `docker-compose exec agent npx prisma migrate status` | Pending or failed migration |
| `relation "users" does not exist` | `npx prisma migrate status` + `npx prisma migrate deploy` | Migrations never ran (empty DB) |
| `already exists` error in migration SQL | Inspect `migration.sql`; check `psql` for the object | Partial prior run left schema objects behind |
| `npx prisma migrate diff` shows unexpected tables | Manual `psql` DDL was run outside migrations | Drift — create a new migration to capture the change or drop the rogue object |
| `_prisma_migrations` table missing | `npx prisma migrate deploy` to initialise it | Brand new database |
| Migration passes locally but fails in CI | Check `DATABASE_URL` and `DIRECT_URL` env vars; ensure shadow DB URL is set | Environment variable mismatch |

---

## 6. Related Documents

- [`agent/README.md`](../README.md) — Local development setup and Docker Compose quick start
- [`docs/LOCAL_DEVELOPMENT.md`](../../docs/LOCAL_DEVELOPMENT.md) — Full clean-checkout walkthrough
- [`docs/DATABASE_BACKUP.md`](../../docs/DATABASE_BACKUP.md) — Production backup and restore procedures
- [`docs/DISASTER_RECOVERY.md`](../../docs/DISASTER_RECOVERY.md) — Agent failover and state recovery runbook
- [`agent/prisma/schema.prisma`](../prisma/schema.prisma) — Prisma schema definition
- [`agent/prisma/migrations/`](../prisma/migrations/) — Migration SQL history
