import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { fetchVaultState } from '../stellar';
import { getEarningsSummary, getPortfolioValueHistory, getRecentTransactions } from '../database';
import { usePortfolio } from '../usePortfolio';

jest.mock('../stellar', () => ({ fetchVaultState: jest.fn() }));
jest.mock('../database', () => ({
  getEarningsSummary: jest.fn(),
  getPortfolioValueHistory: jest.fn(),
  getRecentTransactions: jest.fn(),
}));

describe('usePortfolio account and network isolation', () => {
  it('does not render the previous account portfolio while the next context loads', async () => {
    const cache = new Map();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{children}</SWRConfig>
    );
    (fetchVaultState as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve({ balance: key === 'GACCOUNTONE' ? 100 : 7, strategy: 'Balanced', exchangeRate: 1, apy: 1 }),
    );
    (getEarningsSummary as jest.Mock).mockResolvedValue({ today: 0, week: 0, month: 0 });
    (getPortfolioValueHistory as jest.Mock).mockResolvedValue([]);
    (getRecentTransactions as jest.Mock).mockResolvedValue([]);

    const { result, rerender } = renderHook(
      ({ publicKey, network }) => usePortfolio(publicKey, network),
      { initialProps: { publicKey: 'GACCOUNTONE', network: 'testnet' }, wrapper },
    );
    await waitFor(() => expect(result.current.data.vaultState.balance).toBe(100));

    rerender({ publicKey: 'GACCOUNTTWO', network: 'mainnet' });
    expect(result.current.data.vaultState.balance).toBe(0);

    await act(async () => {
      await waitFor(() => expect(result.current.data.vaultState.balance).toBe(7));
    });
    expect(fetchVaultState).toHaveBeenCalledWith('GACCOUNTTWO');
  });
});
