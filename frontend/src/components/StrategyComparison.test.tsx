import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StrategyComparison } from './StrategyComparison';

describe('StrategyComparison', () => {
  it('shows qualitative tradeoffs and requests a strategy selection', () => {
    const onSelectStrategy = vi.fn();
    render(<StrategyComparison currentStrategy="Balanced" onSelectStrategy={onSelectStrategy} />);

    expect(screen.getByRole('heading', { name: 'Compare strategies' })).toBeTruthy();
    expect(screen.getAllByText('Time horizon').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Liquidity expectation/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Uncertainty/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not guarantees/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Choose Growth' }));
    expect(onSelectStrategy).toHaveBeenCalledWith('Growth');
  });
});
