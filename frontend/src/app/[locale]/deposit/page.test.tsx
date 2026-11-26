import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DepositPage from './page';

vi.mock('@/components/Header', () => ({ Header: () => null }));

describe('Deposit review', () => {
  it('requires a new review after the amount changes', () => {
    render(<DepositPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Review Deposit' }));
    expect(screen.getByRole('region', { name: 'Deposit review' }).textContent).toContain('50 USDC');

    fireEvent.change(screen.getByLabelText('Deposit Amount (USDC)'), { target: { value: '75' } });
    expect(screen.queryByRole('region', { name: 'Deposit review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm Deposit' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Review Deposit' }));
    expect(screen.getByRole('region', { name: 'Deposit review' }).textContent).toContain('75 USDC');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Deposit' }));
    expect(screen.getByText(/Successfully deposited 75 USDC/)).toBeTruthy();
  });
});
