#!/usr/bin/env bash
# Reset and reseed only the dedicated staging PostgreSQL/Supabase project.

set -euo pipefail

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"
: "${STAGING_DATABASE_HOST:?STAGING_DATABASE_HOST must be configured as a staging-only host}"
: "${STAGING_DATABASE_NAME:?STAGING_DATABASE_NAME must be configured as a staging-only database name}"
if [[ "${APP_ENV:-}" != "staging" ]]; then
  echo "Refusing database reset unless APP_ENV=staging" >&2
  exit 1
fi

# Compare the actual destination in the URL with independently configured
# staging identity values before opening a connection or running destructive SQL.
if ! python3 - "$STAGING_DATABASE_URL" "$STAGING_DATABASE_HOST" "$STAGING_DATABASE_NAME" <<'PY'
import sys
from urllib.parse import unquote, urlsplit

url, expected_host, expected_database = sys.argv[1:]
parsed = urlsplit(url)
host = (parsed.hostname or "").lower()
database = unquote(parsed.path.lstrip("/"))
for value in (host, database, expected_host, expected_database):
    if any(marker in value.lower() for marker in ("prod", "production", "mainnet", "live")):
        raise SystemExit("Refusing database reset: destination has a production-like identity")
if parsed.scheme not in ("postgres", "postgresql"):
    raise SystemExit("Refusing database reset: expected a PostgreSQL connection URL")
if not parsed.username or not parsed.password:
    raise SystemExit("Refusing database reset: URL must use the staging-scoped database credential")
if host != expected_host.lower() or database != expected_database:
    raise SystemExit("Refusing database reset: URL host/database does not match the configured staging identity")
PY
then
  exit 1
fi

ACTUAL_DATABASE="$(psql "$STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc 'SELECT current_database()')"
if [[ "$ACTUAL_DATABASE" != "$STAGING_DATABASE_NAME" ]]; then
  echo "Refusing database reset: connected database identity does not match staging configuration" >&2
  exit 1
fi

psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
TRUNCATE TABLE
  audit_logs,
  earnings_history,
  yield_snapshots,
  rebalances,
  withdrawals,
  deposits,
  users
RESTART IDENTITY CASCADE;
COMMIT;
SQL

psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/supabase/seed.sql"
echo "Staging database reset and reseeded"
