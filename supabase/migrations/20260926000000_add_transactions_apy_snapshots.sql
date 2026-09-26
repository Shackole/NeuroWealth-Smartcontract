-- Supabase migration: add transactions and apy_snapshots tables
-- Issue #25: User position tracking database schema and ORM models
--
-- This migration extends the existing schema (20260728000000) with the
-- new tables required by Issue #25 and aligns the users table with the
-- Prisma schema (adds encrypted_secret column + strategy enum).

-- ─────────────────────────────────────────────
-- ENUMS (idempotent — skip if already present)
-- ─────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "Strategy" AS ENUM ('conservative', 'balanced', 'growth');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TransactionType" AS ENUM ('deposit', 'withdrawal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'confirmed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "Protocol" AS ENUM ('blend', 'dex', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────
-- USERS — add encrypted_secret and strategy columns
-- (strategy_preference column existed in the prior migration; we migrate it)
-- ─────────────────────────────────────────────
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "encrypted_secret" TEXT,
    ADD COLUMN IF NOT EXISTS "strategy"          "Strategy" NOT NULL DEFAULT 'balanced';

-- Back-fill strategy from strategy_preference when the old column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'strategy_preference'
    ) THEN
        UPDATE "users"
        SET "strategy" = "strategy_preference"::"Strategy";
    END IF;
END $$;

-- ─────────────────────────────────────────────
-- TRANSACTIONS
-- Unified deposit / withdrawal ledger
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "transactions" (
    "id"         UUID                NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"    UUID                NOT NULL,
    "type"       "TransactionType"   NOT NULL,
    "amount"     NUMERIC(30, 7)      NOT NULL,
    "tx_hash"    TEXT                NOT NULL,
    "ledger"     INTEGER             NOT NULL,
    "status"     "TransactionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT "transactions_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "transactions_tx_hash" UNIQUE ("tx_hash"),
    CONSTRAINT "transactions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_transactions_user_created_at" ON "transactions"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_transactions_tx_hash"         ON "transactions"("tx_hash");
CREATE INDEX IF NOT EXISTS "idx_transactions_status"          ON "transactions"("status");

-- ─────────────────────────────────────────────
-- APY SNAPSHOTS
-- Protocol APY time-series in BPS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "apy_snapshots" (
    "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "protocol"    "Protocol"  NOT NULL,
    "apy_bps"     INTEGER     NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "apy_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_apy_snapshots_protocol_recorded_at"
    ON "apy_snapshots"("protocol", "recorded_at" DESC);

-- ─────────────────────────────────────────────
-- AUDIT LOGS — ensure action column is unrestricted text
-- (prior schema had CHECK constraint limiting values)
-- ─────────────────────────────────────────────
DO $$
BEGIN
    -- Drop the old restrictive check if it exists so the new
    -- audit log system can record keypair_decrypted etc.
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'audit_logs'
          AND constraint_type = 'CHECK'
    ) THEN
        ALTER TABLE "audit_logs"
            DROP CONSTRAINT IF EXISTS "audit_logs_action_check";
    END IF;

    -- Add user_id foreign key if the column exists without one
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'audit_logs'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'user_id'
    ) THEN
        ALTER TABLE "audit_logs"
            ADD COLUMN IF NOT EXISTS "user_id" UUID,
            ADD CONSTRAINT "audit_logs_user_id_fkey"
                FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
    END IF;
END $$;

-- ─────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────
ALTER TABLE "transactions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "apy_snapshots" ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "transactions_select_own" ON "transactions"
    FOR SELECT USING (user_id = auth.uid()::uuid);

CREATE POLICY IF NOT EXISTS "apy_snapshots_select_all" ON "apy_snapshots"
    FOR SELECT USING (true);

-- ─────────────────────────────────────────────
-- Realtime subscriptions
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE "transactions";
ALTER PUBLICATION supabase_realtime ADD TABLE "apy_snapshots";
