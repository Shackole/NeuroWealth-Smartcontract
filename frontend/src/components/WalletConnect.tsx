'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Wallet,
  LogOut,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { shortenAddress } from '@/lib/stellar';
import { useWalletStore } from '@/lib/walletStore';
import {
  connectFreighterWallet,
  fetchXlmBalance,
  isFreighterInstalled,
} from '@/lib/freighter';

// ─── Install Prompt ────────────────────────────────────────────────────────────
function FreighterInstallBanner() {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 max-w-sm"
    >
      <AlertTriangle size={18} className="text-amber-400 shrink-0" />
      <div className="text-xs leading-snug">
        <p className="font-semibold text-amber-300">Freighter not detected</p>
        <p className="text-slate-400 mt-0.5">
          Install the Freighter extension to connect your Stellar wallet.
        </p>
      </div>
      <a
        href="https://www.freighter.app"
        target="_blank"
        rel="noreferrer"
        aria-label="Install Freighter wallet"
        className="ml-auto shrink-0 flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors underline-offset-2 hover:underline"
      >
        Install
        <ExternalLink size={12} />
      </a>
    </div>
  );
}

// ─── Network Mismatch Warning ──────────────────────────────────────────────────
function NetworkMismatchBanner({
  detectedNetwork,
}: {
  detectedNetwork: string;
}) {
  const expected =
    (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet').toLowerCase();
  return (
    <div
      role="alert"
      className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 max-w-xs text-xs"
    >
      <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
      <p className="text-red-300 leading-snug">
        Network mismatch — Freighter is on{' '}
        <strong className="text-red-200">{detectedNetwork}</strong>, but this
        app expects <strong className="text-red-200">{expected}</strong>. Please
        switch networks in Freighter.
      </p>
    </div>
  );
}

// ─── Connected Pill with dropdown ─────────────────────────────────────────────
interface ConnectedPillProps {
  publicKey: string;
  xlmBalance: string | null;
  onDisconnect: () => void;
}

function ConnectedPill({
  publicKey,
  xlmBalance,
  onDisconnect,
}: ConnectedPillProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function copyAddress() {
    navigator.clipboard.writeText(publicKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 bg-slate-900/80 border border-emerald-500/30 rounded-full px-4 py-1.5 shadow-glow-emerald backdrop-blur-md hover:border-emerald-400/50 transition-colors"
      >
        {/* Live indicator dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <span className="text-sm font-medium font-mono text-emerald-400">
          {shortenAddress(publicKey)}
        </span>
        {xlmBalance !== null && (
          <span className="text-xs text-slate-400 font-sans">
            {xlmBalance} XLM
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50">
          <div className="p-4 border-b border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
              Connected Address
            </p>
            <p className="font-mono text-xs text-white break-all leading-snug">
              {publicKey}
            </p>
          </div>

          {xlmBalance !== null && (
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">XLM Balance</span>
              <span className="text-sm font-semibold text-white font-mono">
                {xlmBalance} XLM
              </span>
            </div>
          )}

          <div className="p-2 space-y-1">
            <button
              onClick={copyAddress}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              {copied ? (
                <CheckCheck size={14} className="text-emerald-400" />
              ) : (
                <Copy size={14} />
              )}
              {copied ? 'Copied!' : 'Copy address'}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDisconnect();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export const WalletConnect: React.FC = () => {
  const {
    publicKey,
    xlmBalance,
    network,
    networkMismatch,
    isConnecting,
    isFreighterInstalled: installedInStore,
    error,
    setPublicKey,
    setNetwork,
    setXlmBalance,
    setIsConnecting,
    setIsFreighterInstalled,
    setError,
    disconnect,
  } = useWalletStore();

  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // On mount: probe whether Freighter is installed and attempt auto-reconnect
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      const installed = await isFreighterInstalled();
      if (cancelled) return;
      setIsFreighterInstalled(installed);

      if (!installed) return;

      // If we have a persisted publicKey hint, try auto-reconnect silently
      const persisted = useWalletStore.getState().publicKey;
      if (persisted && !publicKey) {
        const { publicKey: key, network: net } = await connectFreighterWallet();
        if (cancelled) return;
        if (key) {
          setPublicKey(key);
          setNetwork(net);
          const bal = await fetchXlmBalance(key);
          if (!cancelled) setXlmBalance(bal);
        }
      }
    }
    probe();
    return () => {
      cancelled = true;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    setShowInstallBanner(false);

    const installed = await isFreighterInstalled();
    if (!installed) {
      setIsFreighterInstalled(false);
      setShowInstallBanner(true);
      setIsConnecting(false);
      return;
    }

    const { publicKey: key, network: net, error: err } = await connectFreighterWallet();
    setIsConnecting(false);

    if (err === 'not_installed') {
      setShowInstallBanner(true);
      return;
    }

    if (err) {
      setError(err);
      return;
    }

    if (key) {
      setPublicKey(key);
      setNetwork(net);
      const bal = await fetchXlmBalance(key);
      setXlmBalance(bal);
    }
  }

  function handleDisconnect() {
    disconnect();
    setShowInstallBanner(false);
  }

  // Render connected state
  if (publicKey) {
    return (
      <div className="flex flex-col items-end gap-2">
        {networkMismatch && (
          <NetworkMismatchBanner detectedNetwork={network} />
        )}
        <ConnectedPill
          publicKey={publicKey}
          xlmBalance={xlmBalance}
          onDisconnect={handleDisconnect}
        />
      </div>
    );
  }

  // Render install banner
  if (showInstallBanner) {
    return (
      <div className="flex flex-col items-end gap-2">
        <FreighterInstallBanner />
        <button
          onClick={() => setShowInstallBanner(false)}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  // Render connect button
  return (
    <div className="flex flex-col items-end gap-2">
      {error && !showInstallBanner && (
        <p role="alert" className="text-xs text-red-400 max-w-[200px] text-right">
          {error}
        </p>
      )}
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        aria-busy={isConnecting}
        className="relative group flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-semibold px-5 py-2.5 rounded-full transition-all shadow-glow-emerald hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Wallet size={18} className="text-slate-950" aria-hidden="true" />
        <span>{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
      </button>
    </div>
  );
};
