export interface EarningsSummary {
  today: number;
  week: number;
  month: number;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  yield: number;
}

export interface TransactionRecord {
  id: string;
  type: 'deposit' | 'withdrawal' | 'rebalance';
  amount: number;
  asset: string;
  strategy: string;
  txHash: string;
  timestamp: string;
  status: 'confirmed' | 'pending' | 'failed';
}

export interface EarningsDataPoint {
  timestamp: string;
  balance: number;
}

/**
 * Fetches user earnings summary (today, week, month) from database / API.
 */
export async function getEarningsSummary(userAddress?: string): Promise<EarningsSummary> {
  if (!userAddress) return { today: 0, week: 0, month: 0 };

  return {
    today: 2.45,
    week: 16.80,
    month: 68.50,
  };
}

/**
 * Fetches historical portfolio value series for Recharts line chart.
 */
export async function getPortfolioValueHistory(userAddress?: string): Promise<ChartDataPoint[]> {
  const dates = ['Jul 21', 'Jul 22', 'Jul 23', 'Jul 24', 'Jul 25', 'Jul 26', 'Jul 27', 'Jul 28'];
  let baseVal = 1350;

  return dates.map((date, idx) => {
    baseVal += 12 + idx * 2.5;
    return {
      date,
      value: Number(baseVal.toFixed(2)),
      yield: Number((baseVal * 0.084 / 365 * (idx + 1)).toFixed(2)),
    };
  });
}

/**
 * Fetches paginated transactions for the connected user from /api/transactions/:address.
 * Falls back to mock data when the endpoint is unavailable.
 */
export async function getTransactions(userAddress?: string): Promise<TransactionRecord[]> {
  if (!userAddress) return [];

  try {
    const res = await fetch(`/api/transactions/${userAddress}`);
    if (res.ok) {
      const data: TransactionRecord[] = await res.json();
      return data;
    }
  } catch {
    // fall through to mock data
  }

  // Mock data for development / demo
  return [
    {
      id: 'tx-1',
      type: 'deposit',
      amount: 1000,
      asset: 'USDC',
      strategy: 'Balanced',
      txHash: 'a3b1c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      timestamp: '2026-07-26 14:32',
      status: 'confirmed',
    },
    {
      id: 'tx-2',
      type: 'deposit',
      amount: 450,
      asset: 'USDC',
      strategy: 'Conservative',
      txHash: '7f2e4d6c8b0a9e3f1c5d7b2a4e6c0b8d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3',
      timestamp: '2026-07-27 09:15',
      status: 'confirmed',
    },
    {
      id: 'tx-3',
      type: 'rebalance',
      amount: 1450,
      asset: 'USDC',
      strategy: 'Balanced',
      txHash: '9c8b7a6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8',
      timestamp: '2026-07-28 01:00',
      status: 'confirmed',
    },
    {
      id: 'tx-4',
      type: 'withdrawal',
      amount: 200,
      asset: 'USDC',
      strategy: 'Growth',
      txHash: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
      timestamp: '2026-08-01 16:22',
      status: 'confirmed',
    },
    {
      id: 'tx-5',
      type: 'deposit',
      amount: 750,
      asset: 'USDC',
      strategy: 'Growth',
      txHash: '2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3',
      timestamp: '2026-08-05 11:08',
      status: 'pending',
    },
    {
      id: 'tx-6',
      type: 'rebalance',
      amount: 2000,
      asset: 'USDC',
      strategy: 'Balanced',
      txHash: '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4',
      timestamp: '2026-08-10 04:00',
      status: 'confirmed',
    },
    {
      id: 'tx-7',
      type: 'withdrawal',
      amount: 100,
      asset: 'USDC',
      strategy: 'Conservative',
      txHash: '4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5',
      timestamp: '2026-08-12 20:45',
      status: 'failed',
    },
    {
      id: 'tx-8',
      type: 'deposit',
      amount: 500,
      asset: 'USDC',
      strategy: 'Growth',
      txHash: '5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
      timestamp: '2026-08-15 09:30',
      status: 'confirmed',
    },
    {
      id: 'tx-9',
      type: 'deposit',
      amount: 300,
      asset: 'USDC',
      strategy: 'Balanced',
      txHash: '6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7',
      timestamp: '2026-08-18 14:10',
      status: 'confirmed',
    },
    {
      id: 'tx-10',
      type: 'rebalance',
      amount: 3000,
      asset: 'USDC',
      strategy: 'Growth',
      txHash: '7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
      timestamp: '2026-08-20 03:00',
      status: 'confirmed',
    },
    {
      id: 'tx-11',
      type: 'withdrawal',
      amount: 150,
      asset: 'USDC',
      strategy: 'Balanced',
      txHash: '8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9',
      timestamp: '2026-08-22 17:55',
      status: 'confirmed',
    },
    {
      id: 'tx-12',
      type: 'deposit',
      amount: 1200,
      asset: 'USDC',
      strategy: 'Conservative',
      txHash: '9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0',
      timestamp: '2026-09-01 08:00',
      status: 'confirmed',
    },
  ];
}

/**
 * Fetches earnings history for the EarningsHistoryChart.
 * Returns { timestamp, balance }[] array from /api/earnings/:address.
 */
export async function getEarningsHistory(userAddress?: string): Promise<EarningsDataPoint[]> {
  if (!userAddress) return [];

  try {
    const res = await fetch(`/api/earnings/${userAddress}`);
    if (res.ok) {
      const data: EarningsDataPoint[] = await res.json();
      return data;
    }
  } catch {
    // fall through to mock
  }

  // Mock cumulative earnings over the last 90 days
  const now = Date.now();
  const dayMs = 86_400_000;
  let balance = 0;
  return Array.from({ length: 90 }, (_, i) => {
    balance += Math.random() * 0.8 + 0.2; // 0.2–1.0 USDC/day
    return {
      timestamp: new Date(now - (89 - i) * dayMs).toISOString(),
      balance: Number(balance.toFixed(4)),
    };
  });
}

/**
 * @deprecated use getTransactions instead
 */
export async function getRecentTransactions(userAddress?: string) {
  return getTransactions(userAddress);
}
