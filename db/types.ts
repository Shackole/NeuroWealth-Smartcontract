export interface UserRecord {
  id: string;
  stellar_address: string;
  phone_hash?: string | null;
  strategy_preference: 'conservative' | 'balanced' | 'growth';
  created_at: string;
  updated_at: string;
}

export interface DepositRecord {
  id: string;
  user_id: string;
  amount: number;
  shares: number;
  tx_hash: string;
  timestamp: string;
}

export interface WithdrawalRecord {
  id: string;
  user_id: string;
  amount: number;
  shares: number;
  tx_hash: string;
  timestamp: string;
}

export interface RebalanceRecord {
  id: string;
  protocol: 'blend' | 'dex' | 'none';
  amount_moved: number;
  apy_before: number;
  apy_after: number;
  tx_hash: string;
  timestamp: string;
}

export interface YieldSnapshotRecord {
  id: string;
  user_id: string;
  total_assets: number;
  timestamp: string;
}

export interface EarningsHistoryRecord {
  id: string;
  user_id: string;
  daily_earnings: number;
  date: string;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  table_name: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface VaultEventRecord {
  event_id: string;
  event_type: 'deposit' | 'withdraw' | 'rebalance' | 'harvest';
  ledger_sequence: number;
  tx_hash?: string | null;
  idempotency_key?: string | null;
  amount_stroops: number;
  shares_stroops: number;
  created_at: string;
}

export interface QueuedTransactionRecord {
  job_id: string;
  idempotency_key: string;
  action: 'deposit' | 'withdraw' | 'rebalance' | 'harvest';
  amount_stroops: number;
  network_passphrase: string;
  contract_id: string;
  authorized_actor: string;
  required_role: 'user' | 'agent' | 'owner';
  ledger_checkpoint: number;
  status: 'queued' | 'in_flight' | 'confirmed' | 'skipped_duplicate' | 'blocked';
  tx_hash?: string | null;
  updated_at: string;
}
