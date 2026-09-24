#!/usr/bin/env bash
# Reset and reseed only the dedicated staging PostgreSQL/Supabase project.

set -euo pipefail

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL is required}"
if [[ "${APP_ENV:-staging}" != "staging" ]]; then
  echo "Refusing database reset unless APP_ENV=staging" >&2
  exit 1
fi
if [[ "$STAGING_DATABASE_URL" == *prod* || "$STAGING_DATABASE_URL" == *mainnet* ]]; then
  echo "Refusing database reset: URL looks like production" >&2
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