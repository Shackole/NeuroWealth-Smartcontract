import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalModal } from '../WithdrawalModal';
import { executeWithdrawal, previewWithdrawShares } from '@/lib/vaultHelpers';

vi.mock('@/lib/vaultHelpers', () => ({
  executeWithdrawal: vi.fn(),
  previewWithdrawShares: vi.fn(),
}));

describe('confirmed withdrawal regression', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the dashboard only after the real withdrawal flow confirms a ledger hash', async () => {
    vi.mocked(previewWithdrawShares).mockResolvedValue(9.75);
    vi.mocked(executeWithdrawal).mockResolvedValue({
      txHash: 'a'.repeat(64),
      newBalance: 12.5,
    });
    const onSuccess = vi.fn();
    render(
      <WithdrawalModal
        isOpen
        onClose={vi.fn()}
        userPublicKey="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        balance={20}
        exchangeRate={1}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/withdrawal amount in usdc/i), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: /preview withdrawal/i }));
    await screen.findByText(/confirm withdrawal/i);
    fireEvent.click(screen.getByRole('button', { name: /sign & withdraw/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(12.5));
    expect(executeWithdrawal).toHaveBeenCalledWith(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      7.5,
      false,
    );
    expect(await screen.findByText(/confirmed on stellar network/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view on stellar expert/i })).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${'a'.repeat(64)}`,
    );
  });

  it('keeps the displayed balance unchanged when Soroban rejects the submission', async () => {
    vi.mocked(previewWithdrawShares).mockResolvedValue(4.5);
    vi.mocked(executeWithdrawal).mockRejectedValue(new Error('Soroban transaction failed'));
    const onSuccess = vi.fn();
    render(
      <WithdrawalModal
        isOpen
        onClose={vi.fn()}
        userPublicKey="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        balance={20}
        exchangeRate={1}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/withdrawal amount in usdc/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /preview withdrawal/i }));
    await screen.findByText(/confirm withdrawal/i);
    fireEvent.click(screen.getByRole('button', { name: /sign & withdraw/i }));

    expect(await screen.findByText(/soroban transaction failed/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByText(/confirmed on stellar network/i)).not.toBeInTheDocument();
  });
});
