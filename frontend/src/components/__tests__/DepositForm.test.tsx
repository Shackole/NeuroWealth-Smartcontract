import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DepositForm } from '../DepositForm';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';

describe('DepositForm Component Tests', () => {
  const mockUser = 'GAYL4...TESTUSERKEY';

  it('renders without error, has correct ARIA attributes and is keyboard accessible', () => {
    render(<DepositForm userPublicKey={mockUser} balance={500} exchangeRate={1.042} />);

    const form = screen.getByRole('form', { name: /deposit form/i });
    expect(form).toBeInTheDocument();

    const input = screen.getByLabelText(/^deposit amount$/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'number');

    const submitBtn = screen.getByRole('button', { name: /confirm deposit/i });
    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn).toBeDisabled(); // Initially disabled with empty amount

    // Tab key accessibility
    input.focus();
    expect(input).toHaveFocus();
  });

  it('validates input and disables submit on invalid amount', async () => {
    const user = userEvent.setup();
    render(<DepositForm userPublicKey={mockUser} balance={500} />);

    const input = screen.getByLabelText(/^deposit amount$/i);
    const submitBtn = screen.getByRole('button', { name: /confirm deposit/i });

    // Empty input: disabled
    expect(submitBtn).toBeDisabled();

    // Zero input: disabled
    await user.type(input, '0');
    expect(submitBtn).toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Clear and enter valid amount
    await user.clear(input);
    await user.type(input, '50');
    expect(submitBtn).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows live preview with exchange rate and calculated shares', async () => {
    const user = userEvent.setup();
    render(<DepositForm userPublicKey={mockUser} balance={1000} exchangeRate={2.0} />);

    const preview = screen.getByRole('region', { name: /deposit preview/i });
    expect(preview).toBeInTheDocument();
    expect(screen.getByText(/2.0000 USDC \/ Share/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/^deposit amount$/i);
    await user.type(input, '100');

    // 100 / 2.0 = 50.0000 NV-SHARES
    expect(screen.getByText(/50.0000 NV-SHARES/i)).toBeInTheDocument();
  });

  it('submits deposit, calls contract mock via MSW, and renders success toast', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    render(<DepositForm userPublicKey={mockUser} balance={1000} exchangeRate={1.0} onSuccess={onSuccess} />);

    const input = screen.getByLabelText(/^deposit amount$/i);
    await user.type(input, '10');

    const submitBtn = screen.getByRole('button', { name: /confirm deposit/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/deposit successful/i)).toBeInTheDocument();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('renders error message when contract deposit fails', async () => {
    server.use(
      http.post('/api/contract/deposit', () => {
        return HttpResponse.json({ success: false, error: 'Vault capacity reached' }, { status: 500 });
      })
    );

    const user = userEvent.setup();
    render(<DepositForm userPublicKey={mockUser} balance={1000} />);

    const input = screen.getByLabelText(/^deposit amount$/i);
    await user.type(input, '50');

    const submitBtn = screen.getByRole('button', { name: /confirm deposit/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('allows clicking DEFAULT button to fill amount', async () => {
    const user = userEvent.setup();
    render(<DepositForm userPublicKey={mockUser} balance={1000} />);

    const defaultBtn = screen.getByRole('button', { name: /set deposit amount to 100/i });
    await user.click(defaultBtn);

    const input = screen.getByLabelText(/^deposit amount$/i);
    expect(input).toHaveValue(100);
  });
});
