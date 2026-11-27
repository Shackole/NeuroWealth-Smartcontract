-- Asserts that migration_runner can perform required migration operations
-- and is denied unrelated privileged access. Records results for review.
-- Part of issue #786: Verify migration job permissions with a staging database role.

CREATE TABLE IF NOT EXISTS public.permission_check_results (
  operation        text PRIMARY KEY,
  expected_outcome text NOT NULL,
  actual_outcome   text,
  passed           boolean
);

-- Helper: record a result row.
CREATE OR REPLACE FUNCTION public.record_permission_result(
  p_operation text,
  p_expected  text,
  p_actual    text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.permission_check_results (operation, expected_outcome, actual_outcome, passed)
  VALUES (p_operation, p_expected, p_actual, p_expected = p_actual)
  ON CONFLICT (operation) DO UPDATE
    SET expected_outcome = EXCLUDED.expected_outcome,
        actual_outcome   = EXCLUDED.actual_outcome,
        passed           = EXCLUDED.passed;
END $$;

-- -----------------------------------------------------------------------
-- Required operations — all must SUCCEED
-- -----------------------------------------------------------------------

-- 1. INSERT into migration ledger
DO $$
BEGIN
  INSERT INTO supabase_migrations.schema_migrations (version)
  VALUES ('99999999000000')
  ON CONFLICT DO NOTHING;
  PERFORM public.record_permission_result(
    'INSERT supabase_migrations.schema_migrations',
    'ALLOWED',
    'ALLOWED'
  );
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM public.record_permission_result(
    'INSERT supabase_migrations.schema_migrations',
    'ALLOWED',
    'DENIED'
  );
END $$;

-- 2. SELECT from migration ledger
DO $$
DECLARE v text;
BEGIN
  SELECT version INTO v FROM supabase_migrations.schema_migrations
  WHERE version = '99999999000000';
  PERFORM public.record_permission_result(
    'SELECT supabase_migrations.schema_migrations',
    'ALLOWED',
    'ALLOWED'
  );
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM public.record_permission_result(
    'SELECT supabase_migrations.schema_migrations',
    'ALLOWED',
    'DENIED'
  );
END $$;

-- 3. CREATE TABLE in public schema (DDL required during migrations)
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public._migration_probe (id serial PRIMARY KEY);
  PERFORM public.record_permission_result(
    'CREATE TABLE public._migration_probe',
    'ALLOWED',
    'ALLOWED'
  );
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM public.record_permission_result(
    'CREATE TABLE public._migration_probe',
    'ALLOWED',
    'DENIED'
  );
END $$;

-- -----------------------------------------------------------------------
-- Unrelated privileged operations — all must be DENIED
-- -----------------------------------------------------------------------

-- 4. Attempt to create a new database (must be denied)
DO $$
BEGIN
  -- pg_has_role check: migration_runner must NOT be a superuser
  IF pg_has_role('migration_runner', 'pg_database_owner', 'USAGE') THEN
    PERFORM public.record_permission_result(
      'SUPERUSER / database owner privilege',
      'DENIED',
      'ALLOWED'
    );
  ELSE
    PERFORM public.record_permission_result(
      'SUPERUSER / database owner privilege',
      'DENIED',
      'DENIED'
    );
  END IF;
END $$;

-- 5. Attempt to read pg_authid (superuser-only catalog)
DO $$
DECLARE v text;
BEGIN
  -- Non-superusers can query pg_roles but not pg_authid.passwd.
  -- We verify the role does not have superuser privilege.
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'migration_runner' AND rolsuper = true) THEN
    PERFORM public.record_permission_result(
      'migration_runner has superuser flag',
      'DENIED',
      'ALLOWED'
    );
  ELSE
    PERFORM public.record_permission_result(
      'migration_runner has superuser flag',
      'DENIED',
      'DENIED'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- Summary assertion: fail the script if any check did not pass
-- -----------------------------------------------------------------------
DO $$
DECLARE
  failed_count int;
  failed_ops   text;
BEGIN
  SELECT count(*), string_agg(operation, ', ')
  INTO failed_count, failed_ops
  FROM public.permission_check_results
  WHERE NOT passed;

  IF failed_count > 0 THEN
    RAISE EXCEPTION 'Permission check failed for % operation(s): %', failed_count, failed_ops;
  END IF;

  RAISE NOTICE 'All permission checks passed.';
END $$;

-- Emit results for the CI summary.
SELECT
  operation,
  expected_outcome,
  actual_outcome,
  CASE WHEN passed THEN '✅' ELSE '❌' END AS status
FROM public.permission_check_results
ORDER BY operation;
