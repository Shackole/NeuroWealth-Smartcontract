-- Migration: 0001_initial_schema
-- Issue #25: User position tracking database schema and ORM models
-- Generated with: prisma migrate dev --name initial_schema

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────
CREATE TYPE "Strategy" AS ENUM ('conservative', 'balanced', 'growth');
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'withdrawal');
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'confirmed', 'failed');
CREATE TYPE "Protocol" AS ENUM ('blend', 'dex', 'none');

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "users" (
    "id"               UUID         NOT NULL DEFAULT uuid_generate_v4(),
    "stellar_address"  TEXT         NOT NULL,
    "phone_hash"       TEXT,
    "encrypted_secret" TEXT,
    "strategy"         "Strategy"   NOT NULL DEFAULT 'balanced',
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_stellar_address_key" ON "users"("stellar_address");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_hash_key"       ON "users"("phone_hash");
CREATE INDEX        IF NOT EXISTS "idx_users_stellar_address"  ON "users"("stellar_address");
CREATE INDEX        IF NOT EXISTS "idx_users_phone_hash"       ON "users"("phone_hash");

-- ─────────────────────────────────────────────
-- TRANSACTIONS
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
-- REBALANCES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "rebalances" (
    "id"            UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "from_protocol" "Protocol"  NOT NULL,
    "to_protocol"   "Protocol"  NOT NULL,
    "amount"        NUMERIC(30, 7) NOT NULL,
    "expected_apy"  INTEGER     NOT NULL,
    "actual_apy"    INTEGER,
    "tx_hash"       TEXT        NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "rebalances_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "rebalances_tx_hash" UNIQUE ("tx_hash")
);

CREATE INDEX IF NOT EXISTS "idx_rebalances_created_at"         ON "rebalances"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rebalances_from_to_protocol"   ON "rebalances"("from_protocol", "to_protocol");

-- ─────────────────────────────────────────────
-- APY SNAPSHOTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "apy_snapshots" (
    "id"          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "protocol"    "Protocol"  NOT NULL,
    "apy_bps"     INTEGER     NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "apy_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_apy_snapshots_protocol_recorded_at" ON "apy_snapshots"("protocol", "recorded_at" DESC);

-- ─────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"         UUID        NOT NULL DEFAULT uuid_generate_v4(),
    "user_id"    UUID,
    "action"     TEXT        NOT NULL,
    "details"    JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created_at" ON "audit_logs"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_logs_action"          ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at"      ON "audit_logs"("created_at" DESC);

-- ─────────────────────────────────────────────
-- Row-Level Security (Supabase)
-- ─────────────────────────────────────────────
ALTER TABLE "users"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rebalances"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "apy_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs"    ENABLE ROW LEVEL SECURITY;

-- Users can only view/update their own profile
CREATE POLICY "users_select_own" ON "users"
    FOR SELECT USING (auth.uid()::uuid = id);
CREATE POLICY "users_update_own" ON "users"
    FOR UPDATE USING (auth.uid()::uuid = id);

-- Users can view their own transactions
CREATE POLICY "transactions_select_own" ON "transactions"
    FOR SELECT USING (user_id = auth.uid()::uuid);

-- Rebalances are readable by all authenticated users (platform transparency)
CREATE POLICY "rebalances_select_all" ON "rebalances"
    FOR SELECT USING (true);

-- APY snapshots are publicly readable
CREATE POLICY "apy_snapshots_select_all" ON "apy_snapshots"
    FOR SELECT USING (true);
