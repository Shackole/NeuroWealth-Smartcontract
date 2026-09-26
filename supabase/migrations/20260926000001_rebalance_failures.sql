-- Migration: rebalance failure recovery table — Issue #37
-- Stores every failed rebalance attempt for audit, alerting, and dashboard.

CREATE TABLE IF NOT EXISTS rebalance_failures (
  id                BIGSERIAL PRIMARY KEY,
  attempt_number    INTEGER       NOT NULL,
  reason            TEXT          NOT NULL,
  ledger            BIGINT        NOT NULL,
  current_protocol  TEXT          NOT NULL DEFAULT 'unknown',
  total_assets      NUMERIC(20,7) NOT NULL DEFAULT 0,
  idle_balance      NUMERIC(20,7) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rebalance_failures_created_at
  ON rebalance_failures (created_at DESC);

COMMENT ON TABLE rebalance_failures IS
  'Records every rebalance failure attempt, vault state snapshot, and recovery actions. Used by the dashboard health endpoint and operator runbooks.';
