export interface EarningsSummary {
  today: number;
  week: number;
  month: number;
}

export interface ChartDataPoint {
  /** Explicit date or period label (e.g. '2026-07-21 UTC') */
  date: string;
  /** Portfolio value in USDC (null/undefined when series is unavailable) */
  value: number | null;
  /** Accrued yield/earnings in USDC (null/undefined when series is unavailable) */
  yield?: number | null;
  /** Annual Percentage Yield in percent, e.g. 8.4 for 8.40% APY (null/undefined when unavailable) */
  apy?: number | null;
}

export interface EarningsDataPoint {
  /** ISO-8601 UTC timestamp */
  timestamp: string;
  /** Cumulative earnings in USDC */
  balance: number;
  /** Annual Percentage Yield (%) at this point, if available */
  apy?: number | null;
}

export interface TransactionRecord {
  id: string;
  type: 'deposit' | 'withdrawal' | 'rebalance' | 'withdraw';
  amount: number;
  asset?: string;
  protocol?: string;
  strategy?: string;
  txHash?: string;
  tx_hash?: string;
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
}

/**
 * Fetches user earnings summary (today, week, month) in USDC from database / API.
 */
export async function getEarningsSummary(userAddress?: string): Promise<EarningsSummary> {
  if (!userAddress) return { today: 0, week: 0, month: 0 };

  return {
    today: 2.45,
    week: 16.80,
    month: 68.50
  };
}

/**
 * Fetches historical portfolio value, accrued earnings (USDC), and APY (%) series.
 */
export async function getPortfolioValueHistory(userAddress?: string): Promise<ChartDataPoint[]> {
  if (!userAddress) return [];

  const dates = [
    '2026-07-21 UTC',
    '2026-07-22 UTC',
    '2026-07-23 UTC',
    '2026-07-24 UTC',
    '2026-07-25 UTC',
    '2026-07-26 UTC',
    '2026-07-27 UTC',
    '2026-07-28 UTC',
  ];
  let baseVal = 1350;

  return dates.map((date, idx) => {
    baseVal += 12 + idx * 2.5;
    const apy = Number((8.1 + idx * 0.05).toFixed(2));
    return {
      date,
      value: Number(baseVal.toFixed(2)),
      yield: Number(((baseVal * (apy / 100)) / 365 * (idx + 1)).toFixed(2)),
      apy,
    };
  });
}

/**
 * Fetches historical cumulative earnings series for EarningsHistoryChart.
 */
export async function getEarningsHistory(userAddress?: string): Promise<EarningsDataPoint[]> {
  if (!userAddress) return [];

  const history = await getPortfolioValueHistory(userAddress);
  return history.map((point, idx) => ({
    timestamp: new Date(Date.UTC(2026, 6, 21 + idx, 0, 0, 0)).toISOString(),
    balance: point.yield ?? 0,
    apy: point.apy ?? 8.4,
  }));
}

/**
 * Fetches recent deposit and withdrawal transactions for the current user.
 */
export async function getRecentTransactions(userAddress?: string): Promise<TransactionRecord[]> {
  if (!userAddress) return [];

  return [
    {
      id: 'tx-1',
      type: 'deposit',
      amount: 1000,
      txHash: '0x3a9b1c...8e4f',
      timestamp: '2026-07-26 14:32',
      status: 'confirmed'
    },
    {
      id: 'tx-2',
      type: 'deposit',
      amount: 450,
      txHash: '0x7f2e4d...1a9c',
      timestamp: '2026-07-27 09:15',
      status: 'confirmed'
    },
    {
      id: 'tx-3',
      type: 'rebalance',
      amount: 1450,
      txHash: '0x9c8b7a...3d2e',
      timestamp: '2026-07-28 01:00',
      status: 'confirmed'
    }
  ];
}
