DO $$
DECLARE
  position_assets numeric;
  preserved_action text;
  migrated_strategy text;
BEGIN
  SELECT total_assets INTO position_assets FROM public.legacy_positions
    WHERE user_id = '11111111-1111-4111-8111-111111111111';
  IF position_assets IS DISTINCT FROM 42.1250000 THEN
    RAISE EXCEPTION 'pre-upgrade position was not preserved';
  END IF;

  SELECT action INTO preserved_action FROM public.audit_logs
    WHERE record_id = '22222222-2222-4222-8222-222222222222';
  IF preserved_action IS DISTINCT FROM 'INSERT' THEN
    RAISE EXCEPTION 'pre-upgrade audit record was not preserved';
  END IF;

  SELECT strategy::text INTO migrated_strategy FROM public.users
    WHERE id = '11111111-1111-4111-8111-111111111111';
  IF migrated_strategy IS DISTINCT FROM 'growth' THEN
    RAISE EXCEPTION 'strategy preference was not migrated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_pkey')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_tx_hash')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_user_id_fkey') THEN
    RAISE EXCEPTION 'transaction constraints are missing';
  END IF;
  IF to_regclass('public.idx_transactions_user_created_at') IS NULL
     OR to_regclass('public.idx_apy_snapshots_protocol_recorded_at') IS NULL
     OR to_regclass('public.idx_rebalance_failures_created_at') IS NULL THEN
    RAISE EXCEPTION 'migration indexes are missing';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260926000000', '20260926000001')) <> 2 THEN
    RAISE EXCEPTION 'migration ledger does not contain exactly one record per applied migration';
  END IF;
END $$;
