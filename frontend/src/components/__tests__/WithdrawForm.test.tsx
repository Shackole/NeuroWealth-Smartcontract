import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WithdrawForm } from '../WithdrawForm';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';

describe('WithdrawForm Component Tests', () => {
  const mockUser = 'GAYL4...TESTUSERKEY';

  it('renders without error, has correct ARIA attributes and is keyboard accessible', () => {
    render(<WithdrawForm userPublicKey={mockUser} balance={500} exchangeRate={1.042} />);

    const form = screen.getByRole('form', { name: /withdraw form/i });
    expect(form).toBeInTheDocument();

    const input = screen.getByLabelText(/^withdraw amount$/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'number');

    const withdrawBtn = screen.getByRole('button', { name: /confirm withdraw/i });
    expect(withdrawBtn).toBeDisabled(); // Disabled when empty

    const withdrawAllBtn = screen.getByRole('button', { name: /withdraw all/i });
    expect(withdrawAllBtn).not.toBeDisabled(); // Enabled since balance > 0
  });

  it('clicking "Withdraw All" triggers withdraw_all contract endpoint via MSW', async () => {
    let withdrawAllCalled = false;
    server.use(
      http.post('/api/contract/withdraw_all', async ({ request }) => {
        const body = (await request.json()) as any;
        if (body.user === mockUser) {
          withdrawAllCalled = true;
        }
        return HttpResponse.json({ success: true, txHash: '0xmockalltx' });
      })
    );

    const user = userEvent.setup();
    const onSuccess = jest.fn();
    render(<WithdrawForm userPublicKey={mockUser} balance={500} onSuccess={onSuccess} />);

    const withdrawAllBtn = screen.getByRole('button', { name: /withdraw all/i });
    await user.click(withdrawAllBtn);

    await waitFor(() => {
      expect(withdrawAllCalled).toBe(true);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/withdrawal successful/i)).toBeInTheDocument();
    });

    expect(onSuccess).toHaveBeenCalledWith('0xmockalltx');
  });

  it('submitting a partial amount triggers withdraw contract endpoint with that amount', async () => {
    let partialAmountWithdrawn: number | null = null;
    server.use(
      http.post('/api/contract/withdraw', async ({ request }) => {
        const body = (await request.json()) as any;
        partialAmountWithdrawn = body.amount;
        return HttpResponse.json({ success: true, txHash: '0xmockpartialtx' });
      })
    );

    const user = userEvent.setup();
    const onSuccess = jest.fn();
    render(<WithdrawForm userPublicKey={mockUser} balance={500} exchangeRate={1.0} onSuccess={onSuccess} />);

    const input = screen.getByLabelText(/^withdraw amount$/i);
    await user.type(input, '5');

    const withdrawBtn = screen.getByRole('button', { name: /confirm withdraw/i });
    expect(withdrawBtn).not.toBeDisabled();
    await user.click(withdrawBtn);

    await waitFor(() => {
      expect(partialAmountWithdrawn).toBe(5);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    expect(onSuccess).toHaveBeenCalledWith('0xmockpartialtx');
  });

  it('validates input and disables partial withdraw on invalid amount or amount exceeding balance', async () => {
    const user = userEvent.setup();
    render(<WithdrawForm userPublicKey={mockUser} balance={100} />);

    const input = screen.getByLabelText(/^withdraw amount$/i);
    const withdrawBtn = screen.getByRole('button', { name: /confirm withdraw/i });

    // Exceeding balance
    await user.type(input, '150');
    expect(withdrawBtn).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Negative / Zero
    await user.clear(input);
    await user.type(input, '0');
    expect(withdrawBtn).toBeDisabled();

    // Valid partial
    await user.clear(input);
    await user.type(input, '50');
    expect(withdrawBtn).not.toBeDisabled();
  });

  it('shows preview calculations for estimated shares burned', async () => {
    const user = userEvent.setup();
    render(<WithdrawForm userPublicKey={mockUser} balance={1000} exchangeRate={2.0} />);

    const preview = screen.getByRole('region', { name: /withdraw preview/i });
    expect(preview).toBeInTheDocument();

    const input = screen.getByLabelText(/^withdraw amount$/i);
    await user.type(input, '40');

    // 40 / 2.0 = 20.0000 NV-SHARES
    expect(screen.getByText(/20.0000 NV-SHARES/i)).toBeInTheDocument();
  });

  it('MAX button sets input value to available balance', async () => {
    const user = userEvent.setup();
    render(<WithdrawForm userPublicKey={mockUser} balance={250} />);

    const maxBtn = screen.getByRole('button', { name: /set maximum withdraw amount/i });
    await user.click(maxBtn);

    const input = screen.getByLabelText(/^withdraw amount$/i);
    expect(input).toHaveValue(250);
  });

  it('renders error message when withdraw fails', async () => {
    server.use(
      http.post('/api/contract/withdraw', () => {
        return HttpResponse.json({ success: false, error: 'Insufficient liquidity' }, { status: 500 });
      })
    );

    const user = userEvent.setup();
    render(<WithdrawForm userPublicKey={mockUser} balance={500} />);

    const input = screen.getByLabelText(/^withdraw amount$/i);
    await user.type(input, '25');

    const withdrawBtn = screen.getByRole('button', { name: /confirm withdraw/i });
    await user.click(withdrawBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders error message when withdraw all fails', async () => {
    server.use(
      http.post('/api/contract/withdraw_all', () => {
        return HttpResponse.json({ success: false, error: 'RPC connection timeout' }, { status: 500 });
      })
    );

    const user = userEvent.setup();
    render(<WithdrawForm userPublicKey={mockUser} balance={500} />);

    const withdrawAllBtn = screen.getByRole('button', { name: /withdraw all/i });
    await user.click(withdrawAllBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
