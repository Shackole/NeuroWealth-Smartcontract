#!/usr/bin/env bash
# Runs the migration-role permission verification tests (issue #786).
# Creates the migration_runner role, runs the permission assertions, and
# prints a summary suitable for a CI job step summary.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
TESTS_DIR="$REPO_ROOT/supabase/tests/migrations"

echo "==> Setting up migration_runner role"
psql -v ON_ERROR_STOP=1 -f "$TESTS_DIR/migration-role-setup.sql"

echo "==> Running permission assertions"
psql -v ON_ERROR_STOP=1 -f "$TESTS_DIR/assert-migration-role-permissions.sql"

echo ""
echo "==> Permission check results"
psql -Atqc "
SELECT
  '| ' || operation || ' | ' || expected_outcome || ' | ' || actual_outcome || ' | ' ||
  CASE WHEN passed THEN '✅' ELSE '❌' END || ' |'
FROM public.permission_check_results
ORDER BY operation;
"

echo ""
echo "==> All migration role permission checks passed"
