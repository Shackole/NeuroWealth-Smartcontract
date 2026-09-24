'use client';

/**
 * NavbarShell
 *
 * Thin client wrapper that owns wallet connection state and renders <Navbar>.
 * Mounted in the root layout so every page gets the navigation bar without
 * each page needing to manage wallet state individually.
 *
 * The Dashboard page (page.tsx) still manages its own local wallet state for
 * vault data fetching — that can be unified in a future refactor.
 */

import React, { useState } from 'react';
import { Navbar } from './Navbar';
import { connectFreighterWallet } from '@/lib/freighter';

export const NavbarShell: React.FC = () => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const key = await connectFreighterWallet();
      if (key) setPublicKey(key);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => setPublicKey(null);

  return (
    <Navbar
      publicKey={publicKey}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      isConnecting={isConnecting}
    />
  );
};
