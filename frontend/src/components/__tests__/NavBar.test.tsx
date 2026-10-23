import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavBar } from '../NavBar';

describe('NavBar Component Tests', () => {
  const mockPublicKey = 'GB_TEST_PUBLIC_KEY_1234567890';

  it('renders brand logo and semantic navigation landmark with proper ARIA attributes', () => {
    render(<NavBar publicKey={null} />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();

    expect(screen.getByText(/NeuroWealth/i)).toBeInTheDocument();
    expect(screen.getByText(/AI Vault/i)).toBeInTheDocument();

    const connectBtn = screen.getByRole('button', { name: /connect freighter wallet/i });
    expect(connectBtn).toBeInTheDocument();
  });

  it('clicking connect button calls onConnect callback', async () => {
    const user = userEvent.setup();
    const onConnect = jest.fn();
    render(<NavBar publicKey={null} onConnect={onConnect} />);

    const connectBtn = screen.getByRole('button', { name: /connect freighter wallet/i });
    await user.click(connectBtn);

    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('displays shortened public key and disconnect button when wallet is connected', async () => {
    const user = userEvent.setup();
    const onDisconnect = jest.fn();
    render(<NavBar publicKey={mockPublicKey} onDisconnect={onDisconnect} />);

    expect(screen.getByText(/GB_TES\.\.\.7890/i)).toBeInTheDocument();

    const disconnectBtn = screen.getByRole('button', { name: /disconnect wallet/i });
    expect(disconnectBtn).toBeInTheDocument();

    await user.click(disconnectBtn);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('toggles mobile menu and handles mobile navigation clicks', async () => {
    const user = userEvent.setup();
    const onConnect = jest.fn();
    render(<NavBar publicKey={null} onConnect={onConnect} />);

    const menuToggle = screen.getByRole('button', { name: /toggle navigation menu/i });
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(menuToggle);
    expect(menuToggle).toHaveAttribute('aria-expanded', 'true');

    const mobileNav = screen.getByRole('navigation', { name: /mobile navigation/i });
    expect(mobileNav).toBeInTheDocument();

    const mobileLinks = screen.getAllByRole('link', { name: /strategies/i });
    await user.click(mobileLinks[mobileLinks.length - 1]);
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    // Reopen and test another mobile link
    await user.click(menuToggle);
    const historyLinks = screen.getAllByRole('link', { name: /history/i });
    await user.click(historyLinks[historyLinks.length - 1]);
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    // Reopen and test mobile connect
    await user.click(menuToggle);
    const mobileConnectBtn = screen.getByRole('button', { name: /connect wallet/i });
    await user.click(mobileConnectBtn);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('handles mobile disconnect button when connected', async () => {
    const user = userEvent.setup();
    const onDisconnect = jest.fn();
    render(<NavBar publicKey={mockPublicKey} onDisconnect={onDisconnect} />);

    const menuToggle = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(menuToggle);

    const mobileDisconnectBtn = screen.getByRole('button', { name: /disconnect \(/i });
    await user.click(mobileDisconnectBtn);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('renders gracefully without optional callbacks', async () => {
    const user = userEvent.setup();
    render(<NavBar publicKey={mockPublicKey} />);

    const menuToggle = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(menuToggle);

    const mobileDisconnectBtn = screen.getByRole('button', { name: /disconnect \(/i });
    await user.click(mobileDisconnectBtn);

    const { unmount } = render(<NavBar publicKey={null} />);
    const connectBtns = screen.getAllByRole('button', { name: /connect freighter wallet/i });
    await user.click(connectBtns[0]);
    unmount();
  });

  it('navigation links are keyboard accessible with focus states', () => {
    render(<NavBar publicKey={null} />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    dashboardLink.focus();
    expect(dashboardLink).toHaveFocus();

    const strategiesLink = screen.getByRole('link', { name: /strategies/i });
    strategiesLink.focus();
    expect(strategiesLink).toHaveFocus();
  });
});
