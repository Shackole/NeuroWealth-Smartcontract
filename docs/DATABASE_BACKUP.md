# Database Backup & Restore Procedure

**Issue:** [#117](https://github.com/Shackole/NeuroWealth-Smartcontract/issues/117)

This document describes the automated backup strategy, retention policy, restore
procedure, and quarterly drill process for the NeuroWealth Supabase PostgreSQL database.

---

## Overview

| Dimension | Configuration |
|-----------|---------------|
| Backup tool | `pg_dump -Fc -Z9` (compressed custom format) |
| Encryption | AES-256-CBC via `openssl enc` |
| Storage | Amazon S3 with versioning + lifecycle rules |
| Schedule | Daily at 02:00 UTC (GitHub Actions) |
| Retention | 7 daily · 4 weekly · 3 monthly |
| PITR | Supabase Pro plan Point-in-Time Recovery (enabled) |
| RTO target | < 2 hours (full restore including download + decryption) |
| RPO target | < 25 hours (alert fires if no backup in 25 h) |

---

## Prerequisites

### Required environment variables / secrets

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Full Postgres connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `BACKUP_S3_BUCKET` | S3 bucket name (no `s3://` prefix) |
| `BACKUP_ENCRYPTION_KEY` | AES-256 passphrase. Generate once with `openssl rand -hex 32`. Store in a secrets manager. |
| `PAGERDUTY_ROUTING_KEY` | PagerDuty Events API v2 integration key for backup health alerts |
| `AWS_ACCESS_KEY_ID` | AWS credentials (or configure an IAM role on the runner) |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `AWS_DEFAULT_REGION` | AWS region (default: `us-east-1`) |

### Optional variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_S3_PREFIX` | `backups/` | Key prefix inside the S3 bucket |
| `MAX_BACKUP_AGE_HOURS` | `25` | Hours before a missing backup triggers an alert |
| `DRY_RUN` | `false` | Set `true` in `retention.sh` to preview without deleting |

### S3 bucket configuration

Enable the following on the backup S3 bucket:

1. **Versioning** — protects against accidental deletion of backup files.
2. **Server-side encryption** — `SSE-S3` or `SSE-KMS` (defence-in-depth alongside the application-level AES-256 encryption).
3. **Lifecycle rule** — transition objects older than 90 days to `S3 Glacier Instant Retrieval` to reduce storage cost.
4. **Block Public Access** — enabled on all four settings.

---

## Backup Scripts

All scripts are in `scripts/backup/`:

| Script | Purpose |
|--------|---------|
| `backup-db.sh` | Dump → encrypt → upload to S3 + write health beacon |
| `restore-db.sh` | Download → decrypt → validate → restore |
| `retention.sh` | Apply 7-daily / 4-weekly / 3-monthly retention |
| `check-backup-health.sh` | Verify beacon age; alert PagerDuty if stale |

### Run a manual backup

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/neurowealth"
export BACKUP_S3_BUCKET="neurowealth-backups-prod"
export BACKUP_ENCRYPTION_KEY="$(cat /path/to/secret)"
export AWS_DEFAULT_REGION="us-east-1"

./scripts/backup/backup-db.sh
```

---

## Retention Policy

| Window | Snapshots kept |
|--------|----------------|
| Last 7 days | 1 per day (7 total) |
| Last 4 weeks | 1 per ISO week (4 total) |
| Last 3 months | 1 per calendar month (3 total) |

Backups outside all three windows are deleted by `retention.sh`.

Run retention manually:

```bash
export BACKUP_S3_BUCKET="neurowealth-backups-prod"
./scripts/backup/retention.sh

# Preview without deleting:
DRY_RUN=true ./scripts/backup/retention.sh
```

---

## Restore Procedure

**Estimated RTO: < 2 hours** (for a database ≤ 10 GB on a standard VPS with
adequate network throughput to S3).

### Step 1 — Identify the target backup

```bash
./scripts/backup/restore-db.sh --list
```

This prints all available encrypted backup files in S3 with timestamps.
Choose the most recent backup before the incident.

### Step 2 — Dry-run validation (recommended)

```bash
export BACKUP_ENCRYPTION_KEY="..."
export DATABASE_URL="postgresql://..."
export BACKUP_S3_BUCKET="neurowealth-backups-prod"

./scripts/backup/restore-db.sh --dry-run neurowealth_backup_2026-09-27_02-00-01.dump.enc
```

This downloads, decrypts, and validates the backup file without touching the
target database.

### Step 3 — Full restore

```bash
./scripts/backup/restore-db.sh neurowealth_backup_2026-09-27_02-00-01.dump.enc
```

The script:
1. Downloads the encrypted file from S3
2. Decrypts with AES-256-CBC
3. Validates with `pg_restore --list`
4. Pauses for 5 seconds (allows Ctrl-C to abort)
5. Restores with `pg_restore --clean --if-exists --exit-on-error`

### Step 4 — Post-restore verification

After the restore completes, verify data integrity:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM transactions;"
psql "$DATABASE_URL" -c "SELECT MAX(created_at) FROM vault_events;"
```

---

## Point-in-Time Recovery (PITR)

Supabase Pro plan includes PITR with a default retention of 7 days.

To enable PITR in your Supabase project:

1. Go to **Project Settings → Database → Backups**
2. Enable **Point-in-Time Recovery**
3. Set retention to **7 days** (or the maximum available on your plan)

To restore to a specific point in time:

1. Go to **Project Settings → Database → Backups → Point-in-Time Recovery**
2. Select a target timestamp
3. Click **Restore** — Supabase will spin up a new database instance

> **Note:** PITR restore creates a new Supabase project. After verification,
> update `DATABASE_URL` in all environments to point to the restored instance.

---

## Automated Backup via GitHub Actions

The workflow at `.github/workflows/db-backup.yml` runs daily at 02:00 UTC and:

1. Runs `backup-db.sh` (creates and uploads the backup)
2. Runs `retention.sh` (deletes out-of-window backups)
3. Runs `check-backup-health.sh` (validates the beacon; alerts PagerDuty on failure)

Required GitHub Actions secrets:

```
DATABASE_URL
BACKUP_S3_BUCKET
BACKUP_ENCRYPTION_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_DEFAULT_REGION
PAGERDUTY_ROUTING_KEY
```

Trigger a manual backup run:

```
GitHub → Actions → Database Backup → Run workflow
```

---

## Backup Health Monitoring

`check-backup-health.sh` reads the `backup-health.json` beacon written by every
successful backup run. The beacon contains:

```json
{
  "last_backup_at": "2026-09-27T02:00:14Z",
  "backup_file": "backups/neurowealth_backup_2026-09-27_02-00-14.dump.enc",
  "status": "ok"
}
```

If the beacon is absent or older than `MAX_BACKUP_AGE_HOURS` (default: 25 h),
a critical PagerDuty incident is created.

### What the health beacon proves

The beacon proves that the backup job reported a successful dump/upload. It
does **not** prove that the encrypted object can be decrypted, restored, or
used by the application. An S3 object listing and a fresh beacon are likewise
not restore verification. Only a completed staging restore followed by data
and application checks counts as a verified recovery point.

The database dump covers PostgreSQL data only. `agent/src/stateBackup.ts`
contains versioned state-store implementations and a 60-second-capable backup
manager, but no production instantiation/wiring is present in `agent/src`.
Therefore agent scheduler/metrics state backups must be treated as **not
configured** until the deployed service proves that it calls the manager and
identifies its store/key. If a deployment has added that wiring, back up and
restore that store separately using its provider's snapshot/version mechanism;
record state schema version and `savedAt` and reject incompatible state. Do not
claim the documented agent RPO for an unwired module.

Event ingestion has no durable listener cursor today: `eventListener` begins
from the latest ledger when it starts. Record the last verified ledger from
chain and `MAX(ledger_sequence)` from `vault_events` before recovery, then
reconcile and backfill the gap as described in [the RPC outage runbook](INCIDENT_RUNBOOK.md#54-stellar-rpc-unavailable-p1).
Do not infer event completeness from a database restore alone.

The RPO/RTO figures in the table above are targets, not measured guarantees.
Record actual backup age and elapsed recovery time in each drill. A successful
drill must reconcile restored records and event coverage against the selected
chain ledger, in addition to checking row counts.

---

## Quarterly Restore Drill

A restore drill must be conducted every quarter to validate the backup and the
procedure. Record results using the template below.

### Drill checklist

- [ ] Identify the most recent backup via `--list`
- [ ] Run `--dry-run` validation
- [ ] Restore to a staging database (never production)
- [ ] Verify row counts match expected production values
- [ ] Verify application can connect and query the restored database
- [ ] Record the latest included event ledger and compare it with chain at the selected recovery time
- [ ] Reconcile deposit/withdraw records and transaction hashes against chain events; record any gap and backfill plan
- [ ] Restore the agent state store separately and confirm its `lastLedger` is consistent with the database and chain
- [ ] Verify the deployed agent actually wires `StateBackupManager`; if it does not, mark agent state backup unavailable and record the recovery impact
- [ ] Record actual RTO (target: < 2 hours)
- [ ] Record actual RPO (time/data loss from the incident point)
- [ ] Note any issues or deviations from this document

### Results template

```
## Restore Drill — Q[N] [YEAR]

Date:               YYYY-MM-DD
Conducted by:       @engineer
Backup file used:   neurowealth_backup_YYYY-MM-DD_HH-MM-SS.dump.enc
Backup age at time: X hours

Steps timed:
  Download + decrypt:  XX min
  pg_restore:          XX min
  Verification:        XX min
  Total RTO:           XX min

Issues encountered: (none / describe)
Action items:       (none / describe)

Result: PASS / FAIL
Restore verification: PASS / FAIL (a listed object or fresh beacon alone is not a pass)
Chain reconciliation: PASS / FAIL / GAP DOCUMENTED
Agent state restore: PASS / FAIL / NOT CONFIGURED
```

Append completed drill results to this document under a `## Drill History` section.

---

## Drill History

_No drills recorded yet. First drill due Q4 2026. No staging restore or chain
reconciliation was performed while preparing this runbook; staging access was
not available. Backup existence and the stated RTO remain unverified._
