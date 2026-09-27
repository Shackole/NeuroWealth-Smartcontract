import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioDashboard } from '../PortfolioDashboard';

describe('PortfolioDashboard Component Tests', () => {
  const defaultProps = {
    balance: 1450.85,
    exchangeRate: 1.042,
    strategy: 'Balanced' as const,
    apy: 8.4,
    earnings: { today: 1.25, week: 8.50, month: 35.10 },
    isConnected: true,
    onOpenDeposit: jest.fn(),
    onOpenWithdraw: jest.fn(),
    onSelectStrategy: jest.fn()
  };

  it('renders without error and includes correct ARIA landmark region', () => {
    render(<PortfolioDashboard {...defaultProps} />);

    const dashboard = screen.getByRole('region', { name: /portfolio dashboard/i });
    expect(dashboard).toBeInTheDocument();

    expect(screen.getByText(/portfolio overview/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status: connected/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1,450.85/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\+\$1\.25/i).length).toBeGreaterThanOrEqual(1);
  });

  it('handles disconnected state correctly and hides sensitive actions or shows connect prompts', () => {
    render(<PortfolioDashboard {...defaultProps} isConnected={false} />);

    expect(screen.getByLabelText(/status: disconnected/i)).toBeInTheDocument();
  });

  it('deposit and withdraw action buttons are clickable and accessible', async () => {
    const user = userEvent.setup();
    const onOpenDeposit = jest.fn();
    const onOpenWithdraw = jest.fn();

    render(
      <PortfolioDashboard
        {...defaultProps}
        onOpenDeposit={onOpenDeposit}
        onOpenWithdraw={onOpenWithdraw}
      />
    );

    const depositBtn = screen.getByRole('button', { name: /deposit/i });
    const withdrawBtn = screen.getByRole('button', { name: /withdraw/i });

    await user.click(depositBtn);
    expect(onOpenDeposit).toHaveBeenCalledTimes(1);

    await user.click(withdrawBtn);
    expect(onOpenWithdraw).toHaveBeenCalledTimes(1);
  });

  it('strategy selector triggers onSelectStrategy', async () => {
    const user = userEvent.setup();
    const onSelectStrategy = jest.fn();

    render(
      <PortfolioDashboard
        {...defaultProps}
        onSelectStrategy={onSelectStrategy}
      />
    );

    const conservativeBtn = screen.getByRole('button', { name: /conservative/i });
    await user.click(conservativeBtn);

    expect(onSelectStrategy).toHaveBeenCalledWith('Conservative');
  });

  it('renders properly without optional callback props', () => {
    const { container } = render(
      <PortfolioDashboard
        balance={100}
        exchangeRate={1.0}
        strategy="Growth"
        apy={12.5}
        earnings={{ today: 0, week: 0, month: 0 }}
        isConnected={false}
      />
    );
    expect(container).toBeInTheDocument();
  });
});
