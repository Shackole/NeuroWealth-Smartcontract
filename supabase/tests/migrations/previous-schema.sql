-- Minimal shape from the previously deployed schema, with deliberately retained user data.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  stellar_address text UNIQUE NOT NULL,
  strategy_preference text NOT NULL DEFAULT 'balanced'
    CHECK (strategy_preference IN ('conservative', 'balanced', 'growth')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.legacy_positions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  total_assets numeric(30, 7) NOT NULL
);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260728000000');

INSERT INTO public.users (id, stellar_address, strategy_preference)
VALUES ('11111111-1111-4111-8111-111111111111', 'GPREVIOUSSCHEMAACCOUNT', 'growth');
INSERT INTO public.legacy_positions (user_id, total_assets)
VALUES ('11111111-1111-4111-8111-111111111111', 42.1250000);
INSERT INTO public.audit_logs (table_name, action, record_id, details)
VALUES ('legacy_positions', 'INSERT', '22222222-2222-4222-8222-222222222222', '{"preserved":true}');
