'use client';

import useSWR from 'swr';
import { fetchVaultState, VaultState } from './stellar';
import {
  getEarningsSummary,
  getPortfolioValueHistory,
  getRecentTransactions,
  EarningsSummary,
  ChartDataPoint,
  TransactionRecord,
} from './database';

/** Full shape returned by usePortfolio */
export interface PortfolioData {
  vaultState: VaultState;
  earnings: EarningsSummary;
  chartData: ChartDataPoint[];
  transactions: TransactionRecord[];
}

const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Fetcher used by SWR. The key is `['portfolio', publicKey]`.
 * Returns null when publicKey is absent so SWR suspends silently.
 */
async function fetchPortfolio(
  _key: string,
  publicKey: string
): Promise<PortfolioData> {
  const [vaultState, earnings, chartData, transactions] = await Promise.all([
    fetchVaultState(publicKey),
    getEarningsSummary(publicKey),
    getPortfolioValueHistory(publicKey),
    getRecentTransactions(publicKey),
  ]);
  return { vaultState, earnings, chartData, transactions };
}

const EMPTY_DATA: PortfolioData = {
  vaultState: { balance: 0, strategy: 'Balanced', exchangeRate: 1.042, apy: 8.4 },
  earnings: { today: 0, week: 0, month: 0 },
  chartData: [],
  transactions: [],
};

/**
 * usePortfolio — SWR-powered portfolio data hook.
 *
 * - Auto-refreshes every 30 seconds while the tab is visible.
 * - Revalidates on window focus.
 * - Exposes `isLoading`, `error`, and a `refresh` function.
 */
export function usePortfolio(publicKey: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PortfolioData>(
    publicKey ? ['portfolio', publicKey] : null,
    ([_key, pk]: [string, string]) => fetchPortfolio(_key, pk),
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
      // Keep previous data while revalidating so the UI doesn't flash blank
      keepPreviousData: true,
    }
  );

  return {
    data: data ?? EMPTY_DATA,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}
