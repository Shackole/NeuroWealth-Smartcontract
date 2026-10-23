#!/usr/bin/env bash
# Restore a pre-sanitized encrypted backup into the workflow's isolated Postgres service.
set -Eeuo pipefail

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL must point to the disposable restore database}"
: "${STAGING_BACKUP_PATH:?STAGING_BACKUP_PATH is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${RESTORE_REPORT_PATH:=restore-report.json}"

started_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
started_epoch="$(date +%s)"
status="failed"
summary="restore did not complete"
tmpdir="$(mktemp -d)"
cleanup() {
  local exit_code=$?
  local finished_at duration
  finished_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  duration=$(( $(date +%s) - started_epoch ))
  mkdir -p "$(dirname "$RESTORE_REPORT_PATH")"
  printf '{"status":"%s","started_at":"%s","finished_at":"%s","duration_seconds":%s,"summary":"%s"}\n' \
    "$status" "$started_at" "$finished_at" "$duration" "$summary" > "$RESTORE_REPORT_PATH"
  rm -rf "$tmpdir"
  if (( exit_code != 0 )); then exit "$exit_code"; fi
}
trap cleanup EXIT

# This workflow must never accept a remote database URL, even if misconfigured.
database_host="$(python3 -c 'from urllib.parse import urlparse; import os; print(urlparse(os.environ["STAGING_DATABASE_URL"]).hostname or "")')"
database_name="$(python3 -c 'from urllib.parse import urlparse; import os; print(urlparse(os.environ["STAGING_DATABASE_URL"]).path.lstrip("/"))')"
case "$database_host" in localhost|127.0.0.1|::1) ;; *) echo "Refusing non-local restore target host: $database_host" >&2; exit 2 ;; esac
if [[ "$database_name" != "restore_db" ]]; then
  echo "Refusing database '$database_name'; only the disposable restore_db database is allowed" >&2
  exit 2
fi
if [[ ! -s "$STAGING_BACKUP_PATH" ]]; then echo 'Encrypted staging backup is missing or empty' >&2; exit 2; fi

plain_dump="$tmpdir/staging.dump"
echo "Decrypting sanitized backup from $STAGING_BACKUP_PATH"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass env:BACKUP_ENCRYPTION_KEY -in "$STAGING_BACKUP_PATH" -out "$plain_dump"

echo "Restoring into isolated database $database_host/$database_name"
pg_restore --no-password --exit-on-error --no-owner --no-privileges \
  --clean --if-exists --single-transaction --dbname="$STAGING_DATABASE_URL" "$plain_dump"

echo 'Checking required relations, validated constraints, and row counts'
psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE missing_tables TEXT;
DECLARE invalid_constraints BIGINT;
BEGIN
  SELECT string_agg(required.table_name, ', ')
    INTO missing_tables
    FROM (VALUES ('users'), ('transactions'), ('rebalances'), ('apy_snapshots'), ('audit_logs')) AS required(table_name)
    WHERE to_regclass('public.' || required.table_name) IS NULL;
  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'required tables missing: %', missing_tables;
  END IF;

  SELECT COUNT(*) INTO invalid_constraints
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace AND NOT convalidated;
  IF invalid_constraints > 0 THEN
    RAISE EXCEPTION 'found % unvalidated constraints', invalid_constraints;
  END IF;

  IF EXISTS (SELECT 1 FROM transactions WHERE amount < 0 OR ledger < 0 OR tx_hash = '') THEN
    RAISE EXCEPTION 'transactions contain negative amounts/ledgers or empty transaction hashes';
  END IF;
END $$;

SELECT 'users=' || COUNT(*) FROM users;
SELECT 'transactions=' || COUNT(*) FROM transactions;
SELECT 'rebalances=' || COUNT(*) FROM rebalances;
SELECT 'apy_snapshots=' || COUNT(*) FROM apy_snapshots;
SELECT 'audit_logs=' || COUNT(*) FROM audit_logs;
SELECT 'confirmed_transactions=' || COUNT(*) FROM transactions WHERE status = 'confirmed';
SQL

if [[ -n "${STELLAR_HORIZON_URL:-}" ]]; then
  scripts/backup/reconcile-restored-transactions.sh
else
  echo 'STELLAR_HORIZON_URL is required for chain reconciliation' >&2
  exit 2
fi

status="ok"
summary="staging restore, integrity checks, and testnet transaction reconciliation completed"
echo "$summary"
