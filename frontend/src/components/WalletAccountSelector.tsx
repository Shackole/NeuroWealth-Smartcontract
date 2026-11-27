'use client';

import React, { useState, useEffect, useRef, useId } from 'react';
import {
  Check,
  Shield,
  User,
  Users,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Smartphone,
  Keyboard,
  Key,
  ExternalLink,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { shortenAddress } from '@/lib/stellar';
import { useWalletStore } from '@/lib/walletStore';

export interface WalletAccountIdentity {
  id: string;
  publicKey: string;
  nickname: string;
  accountType: 'Personal' | 'Trading' | 'Operator' | 'Hardware';
  network: 'testnet' | 'mainnet';
  balanceUsdc: string;
  balanceXlm: string;
  avatarColor: string;
  lastActive: string;
}

const DEFAULT_PROTOTYPE_ACCOUNTS: WalletAccountIdentity[] = [
  {
    id: 'acc-1',
    publicKey: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFXYORZB2O4MWZDURN52C',
    nickname: 'Primary Savings',
    accountType: 'Personal',
    network: 'testnet',
    balanceUsdc: '12,450.00',
    balanceXlm: '340.50',
    avatarColor: 'from-emerald-500 to-teal-600',
    lastActive: 'Today, 09:15',
  },
  {
    id: 'acc-2',
    publicKey: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
    nickname: 'Yield Strategy Alpha',
    accountType: 'Trading',
    network: 'testnet',
    balanceUsdc: '48,120.75',
    balanceXlm: '1,200.00',
    avatarColor: 'from-blue-500 to-indigo-600',
    lastActive: 'Yesterday',
  },
  {
    id: 'acc-3',
    publicKey: 'GCKWUQGSVO45ZV3QK7K5SOH6W2K4Q5O6I4J4Y3G6T4R3E2W1Q0Z9Y8X7',
    nickname: 'Multisig Operator Kiosk',
    accountType: 'Operator',
    network: 'testnet',
    balanceUsdc: '250,000.00',
    balanceXlm: '5,000.00',
    avatarColor: 'from-purple-500 to-pink-600',
    lastActive: '3 days ago',
  },
];

interface WalletAccountSelectorProps {
  accounts?: WalletAccountIdentity[];
  activePublicKey?: string | null;
  onSelectAccount?: (account: WalletAccountIdentity) => void;
  isSharedDeviceMode?: boolean;
  onToggleSharedDeviceMode?: (enabled: boolean) => void;
  className?: string;
}

export const WalletAccountSelector: React.FC<WalletAccountSelectorProps> = ({
  accounts = DEFAULT_PROTOTYPE_ACCOUNTS,
  activePublicKey,
  onSelectAccount,
  isSharedDeviceMode = true,
  onToggleSharedDeviceMode,
  className = '',
}) => {
  const storePublicKey = useWalletStore((state) => state.publicKey);
  const setStorePublicKey = useWalletStore((state) => state.setPublicKey);
  const currentKey = activePublicKey ?? storePublicKey ?? accounts[0].publicKey;

  const [selectedId, setSelectedId] = useState<string>(() => {
    const match = accounts.find((a) => a.publicKey === currentKey);
    return match ? match.id : accounts[0].id;
  });

  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null);
  const [expandedAddressId, setExpandedAddressId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedDeviceEnabled, setSharedDeviceEnabled] = useState(isSharedDeviceMode);

  const listboxId = useId();
  const confirmationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const match = accounts.find((a) => a.publicKey === currentKey);
    if (match && match.id !== selectedId) {
      setSelectedId(match.id);
    }
  }, [currentKey, accounts]);

  const handleSelect = (account: WalletAccountIdentity, triggeredBy: 'keyboard' | 'touch' | 'mouse') => {
    setSelectedId(account.id);
    setStorePublicKey(account.publicKey);
    if (onSelectAccount) {
      onSelectAccount(account);
    }

    // Haptic feedback for touch devices if available
    if (triggeredBy === 'touch' && typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch {
        // Ignore vibration errors if blocked by browser policy
      }
    }

    // Set accessible confirmation announcement
    const message = `Active identity confirmed: ${account.nickname} (${shortenAddress(account.publicKey)}) via ${triggeredBy}.`;
    setConfirmationNotice(message);

    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current);
    }
    confirmationTimerRef.current = setTimeout(() => {
      setConfirmationNotice(null);
    }, 4000);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % accounts.length;
      const targetRow = document.getElementById(`${listboxId}-account-${accounts[nextIndex].id}`);
      targetRow?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + accounts.length) % accounts.length;
      const targetRow = document.getElementById(`${listboxId}-account-${accounts[prevIndex].id}`);
      targetRow?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(accounts[index], 'keyboard');
    }
  };

  const handleCopyAddress = (e: React.MouseEvent, account: WalletAccountIdentity) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(account.publicKey).then(() => {
        setCopiedId(account.id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    }
  };

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-[#0b0f19] p-4 sm:p-6 shadow-2xl ${className}`}
      role="region"
      aria-labelledby={`${listboxId}-title`}
    >
      {/* Header & Shared Device Banner */}
      <div className="flex flex-col gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Users size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 id={`${listboxId}-title`} className="text-sm sm:text-base font-semibold text-white">
                Wallet Identity Selection
              </h3>
              <p className="text-xs text-slate-400">Choose and confirm your active account on this device</p>
            </div>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700">
            <Shield size={12} className="text-emerald-400" aria-hidden="true" />
            Shared Device
          </span>
        </div>

        {/* Shared Device Safety Advisory */}
        <div className="flex items-start justify-between gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
            <span>
              <strong>Shared device protection:</strong> Verify the nickname and full address before approving transactions.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !sharedDeviceEnabled;
              setSharedDeviceEnabled(next);
              onToggleSharedDeviceMode?.(next);
            }}
            aria-pressed={sharedDeviceEnabled}
            className="shrink-0 text-[11px] underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            {sharedDeviceEnabled ? 'High Privacy Mode On' : 'Enable High Privacy'}
          </button>
        </div>
      </div>

      {/* Screen Reader Live Status for Active Selection */}
      <div className="sr-only" aria-live="polite" role="status">
        {confirmationNotice}
      </div>

      {/* Visible Active Selection Banner (touch & keyboard confirmation feedback) */}
      {confirmationNotice && (
        <div
          role="status"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 py-2.5 text-xs text-emerald-300 animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{confirmationNotice}</span>
          </div>
          <span className="text-[10px] uppercase font-mono text-emerald-400/80 font-bold tracking-wider">
            Confirmed
          </span>
        </div>
      )}

      {/* Account Listbox / RadioGroup */}
      <div
        id={listboxId}
        role="radiogroup"
        aria-label="Available wallet identities"
        className="mt-4 space-y-2.5"
      >
        {accounts.map((account, index) => {
          const isSelected = account.id === selectedId;
          const isAddressExpanded = expandedAddressId === account.id;

          return (
            <div
              key={account.id}
              id={`${listboxId}-account-${account.id}`}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onClick={() => handleSelect(account, 'mouse')}
              onTouchEnd={() => handleSelect(account, 'touch')}
              className={`group relative flex flex-col rounded-xl border p-3.5 transition-all cursor-pointer select-none min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-[0.99] ${
                isSelected
                  ? 'border-emerald-500/60 bg-emerald-950/20 shadow-lg shadow-emerald-950/30'
                  : 'border-slate-800/90 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70'
              }`}
            >
              {/* Top Row: Identity Avatar, Name, Badges, Selection Indicator */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Visual Identicon Avatar */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr ${account.avatarColor} p-0.5 shadow-md`}
                    aria-hidden="true"
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950/90 text-white font-bold text-xs">
                      {account.nickname.slice(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">
                        {account.nickname}
                      </span>
                      <span className="rounded-md border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                        {account.accountType}
                      </span>
                      <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        {account.network}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-2 text-xs font-mono text-slate-400">
                      <span>{shortenAddress(account.publicKey, 6)}</span>
                      <span className="text-slate-600 font-sans">·</span>
                      <span className="text-slate-400 font-sans text-[11px]">
                        Last active {account.lastActive}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Balances & Active Confirmation Status */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-semibold text-white font-mono">
                      {account.balanceUsdc} <span className="text-slate-400 font-sans">USDC</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {account.balanceXlm} XLM
                    </div>
                  </div>

                  {/* Radio / Selection Checkmark Pill */}
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500 text-slate-950 shadow-sm'
                        : 'border-slate-700 bg-slate-900 group-hover:border-slate-500'
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check size={14} className="stroke-[3]" />}
                  </div>
                </div>
              </div>

              {/* Bottom expandable toolbar for shared device full-address verification */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedAddressId(isAddressExpanded ? null : account.id);
                  }}
                  className="flex items-center gap-1 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded px-1"
                  aria-expanded={isAddressExpanded}
                  aria-label={`Toggle full public address for ${account.nickname}`}
                >
                  <span>{isAddressExpanded ? 'Hide full address' : 'Inspect full address'}</span>
                  {isAddressExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleCopyAddress(e, account)}
                    className="flex items-center gap-1 hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded px-1.5 py-0.5 bg-slate-800/40"
                    aria-label={`Copy address for ${account.nickname}`}
                  >
                    {copiedId === account.id ? (
                      <>
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-400 text-[11px]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span className="text-[11px]">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded full address details for high-confidence verification on shared devices */}
              {isAddressExpanded && (
                <div
                  className="mt-2 rounded-lg bg-slate-950 p-2.5 border border-slate-800 text-[11px] font-mono text-slate-300 break-all select-all animate-fadeIn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[10px] font-sans font-semibold uppercase text-slate-500 mb-1">
                    Full Public Key (Verification)
                  </p>
                  {account.publicKey}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer controls: Accessibility instructions and actions */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Keyboard size={13} aria-hidden="true" />
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300">Enter</kbd>
            <span>Confirm</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1">
            <Smartphone size={13} aria-hidden="true" />
            <span>Tap to switch</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            const activeAcc = accounts.find((a) => a.id === selectedId) || accounts[0];
            handleSelect(activeAcc, 'mouse');
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Check size={14} aria-hidden="true" />
          <span>Confirm Selected Identity</span>
        </button>
      </div>
    </div>
  );
};
