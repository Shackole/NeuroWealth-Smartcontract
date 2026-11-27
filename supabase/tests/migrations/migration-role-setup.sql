-- Creates an isolated migration_runner role with minimum required permissions.
-- Used by the migration-role-check job in migration-upgrade.yml (issue #786).

-- Create the dedicated migration role (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'migration_runner') THEN
    CREATE ROLE migration_runner LOGIN PASSWORD 'migration_runner_pw';
  END IF;
END $$;

-- Grant connection to the migration database.
GRANT CONNECT ON DATABASE migration_fixture TO migration_runner;

-- Allow the role to use the public schema.
GRANT USAGE ON SCHEMA public TO migration_runner;

-- Allow schema-level DDL required by migrations.
GRANT CREATE ON SCHEMA public TO migration_runner;

-- Allow access to the supabase_migrations tracking schema.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'supabase_migrations') THEN
    CREATE SCHEMA supabase_migrations;
  END IF;
END $$;
GRANT USAGE, CREATE ON SCHEMA supabase_migrations TO migration_runner;

-- Allow the migration role to manage the migration ledger table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'supabase_migrations' AND tablename = 'schema_migrations'
  ) THEN
    CREATE TABLE supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      statements text[],
      name text
    );
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE ON supabase_migrations.schema_migrations TO migration_runner;
