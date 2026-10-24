import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

  it('exposes all earnings and APY chart information via text summary and accessible table without hover or color', () => {
    const chartData = [
      { date: '2026-07-21', value: 1400.0, yield: 12.5, apy: 8.1 },
      { date: '2026-07-22', value: 1425.5, yield: 23.75, apy: 8.3 },
      { date: '2026-07-23', value: 1450.85, yield: 35.1, apy: 8.4 },
    ];

    render(
      <PortfolioDashboard
        {...defaultProps}
        chartData={chartData}
        networkName="Stellar Testnet"
      />
    );

    // Text summary exposes date range (UTC), monetary units (USDC), APY (%), and network without hover
    const summary = screen.getByTestId('chart-text-summary');
    expect(summary).toHaveTextContent(/2026-07-21 \(UTC\)/i);
    expect(summary).toHaveTextContent(/2026-07-23 \(UTC\)/i);
    expect(summary).toHaveTextContent(/\$1,450\.85 USDC/i);
    expect(summary).toHaveTextContent(/\+\$35\.10 USDC/i);
    expect(summary).toHaveTextContent(/8\.40% APY/i);
    expect(summary).toHaveTextContent(/Stellar Testnet/i);

    // Accessible data table exposes every data point with explicit units
    const table = screen.getByRole('table', {
      name: /earnings and apy historical data table/i,
    });
    expect(table).toBeInTheDocument();

    const rows = within(table).getAllByTestId('earnings-apy-table-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('2026-07-21 (UTC)');
    expect(rows[0]).toHaveTextContent('$1,400.00 USDC');
    expect(rows[0]).toHaveTextContent('+$12.50 USDC');
    expect(rows[0]).toHaveTextContent('8.10% APY');
  });

  it('operates table sort, display mode, and series filter controls via keyboard', async () => {
    const user = userEvent.setup();
    const chartData = [
      { date: '2026-07-21', value: 1400.0, yield: 12.5, apy: 8.1 },
      { date: '2026-07-22', value: 1450.85, yield: 35.1, apy: 8.4 },
    ];

    render(<PortfolioDashboard {...defaultProps} chartData={chartData} />);

    const table = screen.getByRole('table', {
      name: /earnings and apy historical data table/i,
    });

    // Sort by Accrued Earnings (USDC) using keyboard Enter
    const sortYieldBtn = within(table).getByRole('button', {
      name: /sort by accrued earnings \(usdc\)/i,
    });
    sortYieldBtn.focus();
    expect(sortYieldBtn).toHaveFocus();
    await user.keyboard('{Enter}'); // first activation selects 'yield' ascending
    await user.keyboard('{Enter}'); // second activation toggles 'yield' descending

    const rowsAfterSort = within(table).getAllByTestId('earnings-apy-table-row');
    expect(rowsAfterSort[0]).toHaveTextContent('+$35.10 USDC');
    expect(rowsAfterSort[1]).toHaveTextContent('+$12.50 USDC');

    // Keyboard roving navigation on series filter toolbar
    const allSeriesBtn = screen.getByRole('button', { name: /^all series$/i });
    allSeriesBtn.focus();
    await user.keyboard('{ArrowRight}');
    const earningsOnlyBtn = screen.getByRole('button', { name: /^earnings \(usdc\)$/i });
    expect(earningsOnlyBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('explicitly reports empty and unavailable series in both text summary and table', () => {
    const { rerender } = render(
      <PortfolioDashboard {...defaultProps} chartData={[]} isConnected={false} />
    );

    expect(screen.getByTestId('chart-summary-empty')).toHaveTextContent(
      /empty series on stellar testnet: 0 data points recorded/i
    );
    expect(screen.getByTestId('table-empty-row')).toHaveTextContent(
      /empty series: no portfolio value \(usdc\), accrued earnings \(usdc\), or net apy \(%\) records available/i
    );

    rerender(
      <PortfolioDashboard
        {...defaultProps}
        seriesUnavailable={true}
        seriesUnavailableReason="Soroban RPC timeout"
      />
    );

    expect(screen.getByTestId('chart-summary-unavailable')).toHaveTextContent(
      /series unavailable on stellar testnet: soroban rpc timeout/i
    );
    expect(screen.getByTestId('table-unavailable-row')).toHaveTextContent(
      /unavailable series: earnings \(usdc\) and net apy \(%\) data could not be loaded from stellar testnet \(soroban rpc timeout\)/i
    );

    // Partial series unavailability (e.g., APY series null while earnings present)
    rerender(
      <PortfolioDashboard
        {...defaultProps}
        apy={NaN}
        chartData={[{ date: '2026-07-21 UTC', value: 1400, yield: 10, apy: null }]}
      />
    );

    const row = screen.getByTestId('earnings-apy-table-row');
    expect(row).toHaveTextContent('Unavailable (% APY)');
    expect(row).toHaveTextContent('Partial (Net APY (%) unavailable)');
  });
});
