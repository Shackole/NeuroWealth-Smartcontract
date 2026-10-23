-- Safe, non-production fixtures for the staging Supabase project.
-- The weekly reset script truncates tables before applying this file.

INSERT INTO users (id, stellar_address, strategy_preference)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  'balanced'
)
ON CONFLICT (id) DO UPDATE
SET stellar_address = EXCLUDED.stellar_address,
    strategy_preference = EXCLUDED.strategy_preference;

INSERT INTO yield_snapshots (user_id, total_assets, timestamp)
VALUES ('00000000-0000-0000-0000-000000000001', 1000, NOW());

INSERT INTO earnings_history (user_id, daily_earnings, date)
VALUES ('00000000-0000-0000-0000-000000000001', 0, CURRENT_DATE)
ON CONFLICT (user_id, date) DO UPDATE
SET daily_earnings = EXCLUDED.daily_earnings;