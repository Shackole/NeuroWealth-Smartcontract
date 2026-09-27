import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategySelector } from '../StrategySelector';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';

describe('StrategySelector Component Tests', () => {
  const mockUser = 'GAYL4...TESTUSERKEY';

  it('renders without error and has correct ARIA attributes', () => {
    render(<StrategySelector userPublicKey={mockUser} activeStrategy="balanced" />);

    const group = screen.getByRole('radiogroup', { name: /investment strategy selector/i });
    expect(group).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);

    const balancedRadio = screen.getByRole('radio', { name: /balanced strategy/i });
    expect(balancedRadio).toHaveAttribute('aria-checked', 'true');

    const conservativeRadio = screen.getByRole('radio', { name: /conservative strategy/i });
    expect(conservativeRadio).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking a card calls set_user_strategy and updates selection', async () => {
    let selectedStrategyReceived: string | null = null;
    server.use(
      http.post('/api/contract/set_user_strategy', async ({ request }) => {
        const body = (await request.json()) as any;
        selectedStrategyReceived = body.strategy;
        return HttpResponse.json({ success: true, strategy: body.strategy });
      })
    );

    const user = userEvent.setup();
    const onSelectStrategy = jest.fn();
    render(
      <StrategySelector
        userPublicKey={mockUser}
        activeStrategy="balanced"
        onSelectStrategy={onSelectStrategy}
      />
    );

    const growthCard = screen.getByRole('radio', { name: /growth strategy/i });
    await user.click(growthCard);

    await waitFor(() => {
      expect(selectedStrategyReceived).toBe('growth');
      expect(growthCard).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('status')).toHaveTextContent(/strategy set to growth/i);
    });

    expect(onSelectStrategy).toHaveBeenCalledWith('growth');
  });

  it('is keyboard accessible with Enter and Space keys', async () => {
    const user = userEvent.setup();
    const onSelectStrategy = jest.fn();
    render(
      <StrategySelector
        userPublicKey={mockUser}
        activeStrategy="growth"
        onSelectStrategy={onSelectStrategy}
      />
    );

    const conservativeCard = screen.getByRole('radio', { name: /conservative strategy/i });
    conservativeCard.focus();
    expect(conservativeCard).toHaveFocus();

    // Press Enter to select
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(conservativeCard).toHaveAttribute('aria-checked', 'true');
    });
    expect(onSelectStrategy).toHaveBeenCalledWith('conservative');

    // Focus Balanced and press Space
    const balancedCard = screen.getByRole('radio', { name: /balanced strategy/i });
    balancedCard.focus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(balancedCard).toHaveAttribute('aria-checked', 'true');
    });
    expect(onSelectStrategy).toHaveBeenCalledWith('balanced');
  });

  it('handles error when set_user_strategy fails', async () => {
    server.use(
      http.post('/api/contract/set_user_strategy', () => {
        return HttpResponse.json({ success: false, error: 'Unauthorized strategy rotation' }, { status: 500 });
      })
    );

    const user = userEvent.setup();
    render(<StrategySelector userPublicKey={mockUser} activeStrategy="balanced" />);

    const conservativeCard = screen.getByRole('radio', { name: /conservative strategy/i });
    await user.click(conservativeCard);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/failed to update strategy/i);
    });
  });

  it('works when no user is connected without invoking contract API', async () => {
    const user = userEvent.setup();
    const onSelectStrategy = jest.fn();
    render(<StrategySelector userPublicKey={null} onSelectStrategy={onSelectStrategy} />);

    const growthCard = screen.getByRole('radio', { name: /growth strategy/i });
    await user.click(growthCard);

    expect(growthCard).toHaveAttribute('aria-checked', 'true');
    expect(onSelectStrategy).toHaveBeenCalledWith('growth');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
