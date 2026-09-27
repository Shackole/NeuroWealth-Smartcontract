'use client';

import React from 'react';
import { Wallet, LogOut } from 'lucide-react';
import { shortenAddress } from '@/lib/stellar';

interface WalletConnectProps {
  publicKey: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting?: boolean;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({
  publicKey,
  onConnect,
  onDisconnect,
  isConnecting
}) => {
  if (publicKey) {
    return (
      <div className="flex items-center gap-3 bg-slate-900/80 border border-emerald-500/30 rounded-full px-4 py-1.5 shadow-glow-emerald backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-sm font-medium font-mono text-emerald-400">
            {shortenAddress(publicKey)}
          </span>
        </div>
        <button
          onClick={onDisconnect}
          aria-label="Disconnect wallet"
          className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-full hover:bg-slate-800 min-h-[32px] min-w-[32px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={isConnecting}
      className="relative group flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-semibold px-5 py-2.5 min-h-[44px] rounded-full transition-all shadow-glow-emerald hover:shadow-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <Wallet size={18} className="text-slate-950" aria-hidden="true" />
      <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
    </button>
  );
};
