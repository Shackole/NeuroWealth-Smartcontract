CREATE TABLE IF NOT EXISTS event_listener_checkpoints (
  network TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  next_ledger BIGINT NOT NULL CHECK (next_ledger > 0),
  pagination_cursor TEXT,
  recovery_required BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (network, contract_id)
);

CREATE INDEX IF NOT EXISTS event_listener_checkpoints_updated_at_idx
  ON event_listener_checkpoints (updated_at DESC);

CREATE TABLE IF NOT EXISTS vault_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  ledger_sequence BIGINT NOT NULL CHECK (ledger_sequence > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_events_ledger_sequence_idx
  ON vault_events (ledger_sequence DESC);
