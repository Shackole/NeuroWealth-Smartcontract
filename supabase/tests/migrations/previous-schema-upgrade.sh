#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
psql -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/migrations/previous-schema.sql"

apply_pending_migrations() {
  local migration version
  for migration in "$repo_root"/supabase/migrations/202609*.sql; do
    version="$(basename "$migration" .sql | cut -d_ -f1)"
    if psql -v ON_ERROR_STOP=1 -Atqc \
      "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$version'" | grep -q 1; then
      continue
    fi
    {
      printf 'BEGIN;\n\\i %s\n' "'$migration'"
      printf "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('%s');\nCOMMIT;\n" "$version"
    } | psql -v ON_ERROR_STOP=1
  done
}

apply_pending_migrations
psql -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/migrations/assert-upgrade.sql"

# A second deploy must consult the migration ledger and skip completed versions.
apply_pending_migrations
psql -v ON_ERROR_STOP=1 -f "$repo_root/supabase/tests/migrations/assert-upgrade.sql"
