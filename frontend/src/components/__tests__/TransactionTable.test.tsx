import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionTable } from '../TransactionTable';
import { TransactionRecord } from '@/lib/database';

describe('TransactionTable Component Tests', () => {
  const mockTransactions: TransactionRecord[] = [
    {
      id: 'tx-1',
      type: 'deposit',
      amount: 100,
      protocol: 'Vault',
      tx_hash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      timestamp: new Date('2026-09-20T10:00:00Z').toISOString(),
      status: 'confirmed'
    },
    {
      id: 'tx-2',
      type: 'withdraw',
      amount: 40,
      protocol: 'Blend',
      tx_hash: '0xaaaa222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      timestamp: new Date('2026-09-21T12:30:00Z').toISOString(),
      status: 'confirmed'
    },
    {
      id: 'tx-3',
      type: 'rebalance',
      amount: 250,
      protocol: 'DEX',
      tx_hash: '0xbbbb222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      timestamp: new Date('2026-09-22T14:15:00Z').toISOString(),
      status: 'confirmed'
    }
  ];

  it('renders table with correct semantic structure and ARIA attributes', () => {
    render(<TransactionTable transactions={mockTransactions} />);

    const table = screen.getByRole('table', { name: /transaction history/i });
    expect(table).toBeInTheDocument();

    const columnHeaders = screen.getAllByRole('columnheader');
    expect(columnHeaders.length).toBe(6);
    expect(columnHeaders[0]).toHaveTextContent(/type/i);
    expect(columnHeaders[1]).toHaveTextContent(/amount/i);
    expect(columnHeaders[2]).toHaveTextContent(/protocol \/ target/i);

    // Verify row count (3 data rows)
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(4); // 1 header row + 3 data rows
  });

  it('renders formatted values and transaction types correctly', () => {
    render(<TransactionTable transactions={mockTransactions} />);

    expect(screen.getByText(/\+100.00 USDC/i)).toBeInTheDocument();
    expect(screen.getByText(/-40.00 USDC/i)).toBeInTheDocument();
    expect(screen.getByText(/Blend/i)).toBeInTheDocument();
    expect(screen.getByText(/DEX/i)).toBeInTheDocument();
  });

  it('handles empty state and shows polite live announcement', () => {
    render(<TransactionTable transactions={[]} />);

    expect(screen.getByText(/no transactions found for this account/i)).toBeInTheDocument();
  });

  it('allows clicking explorer link button and is keyboard accessible', async () => {
    const user = userEvent.setup();
    const onOpenExplorer = jest.fn();
    render(<TransactionTable transactions={mockTransactions} onOpenExplorer={onOpenExplorer} />);

    const explorerButtons = screen.getAllByRole('button', { name: /view transaction/i });
    expect(explorerButtons.length).toBe(3);

    // Click first explorer link
    await user.click(explorerButtons[0]);
    expect(onOpenExplorer).toHaveBeenCalledWith(mockTransactions[0].tx_hash);

    // Keyboard navigation: focus and hit Enter on second explorer link
    explorerButtons[1].focus();
    expect(explorerButtons[1]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onOpenExplorer).toHaveBeenCalledWith(mockTransactions[1].tx_hash);
  });
});
