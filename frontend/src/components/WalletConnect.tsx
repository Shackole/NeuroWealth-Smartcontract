'use client';

import React, { useState } from 'react';
import { Wallet, LogOut, Users, X } from 'lucide-react';
import { shortenAddress } from '@/lib/stellar';
import { useWalletStore } from '@/lib/walletStore';
import { AccountAddress } from './AccountAddress';
import { WalletAccountSelector } from './WalletAccountSelector';

interface WalletConnectProps {
  publicKey: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting?: boolean;
  canRetry?: boolean;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({
  publicKey,
  onConnect,
  onDisconnect,
  isConnecting,
  canRetry,
}) => {
  const network = useWalletStore((state) => state.network);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  if (publicKey) {
    return (
      <>
        <div className="flex items-center gap-3 bg-slate-900/80 border border-emerald-500/30 rounded-full px-4 py-1.5 shadow-glow-emerald backdrop-blur-md" aria-label={`Connected wallet on ${network} network`}>
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
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            aria-label="Switch wallet identity on shared device"
            className="flex items-center gap-1 text-xs text-slate-300 hover:text-emerald-400 transition-colors px-2 py-0.5 rounded-full hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
          >
            <Users size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Switch</span>
          </button>

          <details className="relative text-xs text-slate-300">
            <summary className="cursor-pointer underline underline-offset-2">Account details</summary>
            <div className="absolute right-0 top-6 z-50 w-72 rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl">
              <p className="mb-1 font-semibold">{network === 'unknown' ? 'Network not confirmed' : network}</p>
              <AccountAddress key={publicKey} address={publicKey} />
            </div>
          </details>

          <button
            onClick={onDisconnect}
            aria-label="Disconnect wallet"
            className="text-slate-400 hover:text-red-400 transition-colors p-1 rounded-full hover:bg-slate-800 min-h-[32px] min-w-[32px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Identity Selector Modal for Shared Devices */}
        {isSelectorOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-label="Wallet account identity selector"
          >
            <div className="relative w-full max-w-xl">
              <button
                type="button"
                onClick={() => setIsSelectorOpen(false)}
                aria-label="Close identity selector"
                className="absolute right-4 top-4 z-10 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X size={18} />
              </button>
              <WalletAccountSelector
                activePublicKey={publicKey}
                onSelectAccount={() => {
                  setIsSelectorOpen(false);
                }}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      onClick={onConnect}
      disabled={isConnecting}
      className="relative group flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-semibold px-5 py-2.5 min-h-[44px] rounded-full transition-all shadow-glow-emerald hover:shadow-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <Wallet size={18} className="text-slate-950" aria-hidden="true" />
      <span>{isConnecting ? 'Connecting...' : canRetry ? 'Retry Wallet Connection' : 'Connect Wallet'}</span>
    </button>
  );
};
