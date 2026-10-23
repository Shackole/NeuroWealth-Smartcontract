'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Zap, Flame, X, TrendingUp, AlertTriangle, Layers } from 'lucide-react';

export type Strategy = 'Conservative' | 'Balanced' | 'Growth';

interface StrategyMeta {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  apyRange: string;
  riskLevel: string;
  riskColor: string;
  description: string;
  riskFactors: string[];
  protocols: string[];
}

const STRATEGY_META: Record<Strategy, StrategyMeta> = {
  Conservative: {
    icon: ShieldCheck,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    apyRange: '3–6% APY',
    riskLevel: 'Low Risk',
    riskColor: 'text-blue-400',
    description:
      'Your USDC is lent to borrowers on Blend, a decentralised lending protocol on Stellar. Interest accumulates continuously. The AI agent monitors rates and withdraws if better opportunities appear.',
    riskFactors: [
      'Smart contract vulnerability in Blend',
      'Temporary liquidity squeeze (can delay withdrawals)',
      'Interest rate may drop in low-demand periods',
    ],
    protocols: ['Blend Protocol (lending pools)'],
  },
  Balanced: {
    icon: Zap,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    apyRange: '6–10% APY',
    riskLevel: 'Medium Risk',
    riskColor: 'text-emerald-400',
    description:
      'The AI splits your funds between Blend lending and Stellar DEX liquidity pools. Lending provides stable income; liquidity provision earns trading fees from the DEX. The agent rebalances hourly.',
    riskFactors: [
      'Impermanent loss from DEX price swings',
      'Smart contract risk on Blend and Stellar DEX',
      'Lower APY if DEX trading volume drops',
    ],
    protocols: ['Blend Protocol (lending)', 'Stellar DEX (liquidity provision)'],
  },
  Growth: {
    icon: Flame,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    apyRange: '10–15% APY',
    riskLevel: 'Higher Risk',
    riskColor: 'text-amber-400',
    description:
      'Aggressive multi-protocol deployment. The AI chases the highest available yield across all integrated protocols simultaneously, using aggressive rebalancing. Higher returns come with more volatility.',
    riskFactors: [
      'Higher exposure to impermanent loss',
      'More frequent rebalancing = more gas costs',
      'Yield can fluctuate significantly week to week',
      'Potential protocol concentration risk',
    ],
    protocols: ['Blend Protocol', 'Stellar DEX', 'Multiple liquidity pools'],
  },
};

interface StrategyPopoverProps {
  strategy: Strategy;
  /** Trigger element — defaults to an ⓘ icon button */
  children?: React.ReactNode;
}

/**
 * Rich popover for a strategy card.
 * Opens on click; accessible via keyboard (Escape to close, focus trap handled by button).
 */
export const StrategyPopover: React.FC<StrategyPopoverProps> = ({ strategy, children }) => {
  const [open, setOpen] = useState(false);
  const popoverId = useRef(`popover-${Math.random().toString(36).slice(2)}`).current;
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const meta = STRATEGY_META[strategy];
  const Icon = meta.icon;

  // Close on Escape, focus close button on open
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const popoverEl = document.getElementById(popoverId);
      if (popoverEl && !popoverEl.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, popoverId]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Learn more about ${strategy} strategy`}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {children ?? <span className="text-xs font-bold leading-none">ⓘ</span>}
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-label={`${strategy} strategy details`}
          className="absolute z-50 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 top-full left-0 mt-2"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg ${meta.bg} ${meta.color}`}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <div>
                <div className="font-bold text-white text-sm">{strategy} Strategy</div>
                <div className={`text-xs font-medium ${meta.riskColor}`}>{meta.riskLevel}</div>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close strategy details"
              onClick={() => { setOpen(false); triggerRef.current?.focus(); }}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <X size={14} />
            </button>
          </div>

          {/* APY badge */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.bg} ${meta.color} ${meta.border} mb-3`}>
            <TrendingUp size={12} aria-hidden="true" />
            Typical {meta.apyRange}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-300 leading-relaxed mb-3">{meta.description}</p>

          {/* Protocols */}
          <div className="mb-3">
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-400 mb-1.5">
              <Layers size={12} aria-hidden="true" />
              Protocols used
            </div>
            <ul className="space-y-1">
              {meta.protocols.map((p) => (
                <li key={p} className="text-xs text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Risk factors */}
          <div>
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-400 mb-1.5">
              <AlertTriangle size={12} aria-hidden="true" />
              Risk factors
            </div>
            <ul className="space-y-1">
              {meta.riskFactors.map((r) => (
                <li key={r} className="text-xs text-slate-400 flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 flex-shrink-0 mt-1" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </span>
  );
};
