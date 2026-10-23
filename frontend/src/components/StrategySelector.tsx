'use client';

import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, TrendingUp, Check } from 'lucide-react';
import { setUserStrategy } from '@/lib/contract';
import { fetchPoolAllocation } from '@/lib/vaultHelpers';

export type StrategyType = 'conservative' | 'balanced' | 'growth';

export interface StrategyOption {
  id: StrategyType;
  name: string;
  apy: number;
  risk: 'Low' | 'Medium' | 'High';
  description: string;
  icon: React.ElementType;
}

export const STRATEGIES: StrategyOption[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    apy: 5.2,
    risk: 'Low',
    description: 'Preference for lower volatility and steady lending yield.',
    icon: ShieldCheck
  },
  {
    id: 'balanced',
    name: 'Balanced',
    apy: 8.4,
    risk: 'Medium',
    description: 'Preference for a balance of lending yield and market opportunities.',
    icon: Zap
  },
  {
    id: 'growth',
    name: 'Growth',
    apy: 12.1,
    risk: 'High',
    description: 'Preference for higher growth opportunities with greater market risk.',
    icon: TrendingUp
  }
];

export interface StrategySelectorProps {
  userPublicKey?: string | null;
  /** Saved user preference. It does not assert how the shared pool is currently deployed. */
  activeStrategy?: StrategyType;
  onSelectStrategy?: (strategy: StrategyType) => void;
  /** Current pool-level allocation, expressed in basis points. */
  currentAllocation?: Array<{ protocol: string; weightBps: number }> | null;
  allocationUpdatedAt?: string | null;
}

export const StrategySelector: React.FC<StrategySelectorProps> = ({
  userPublicKey,
  activeStrategy = 'balanced',
  onSelectStrategy,
  currentAllocation,
  allocationUpdatedAt,
}) => {
  const [selected, setSelected] = useState<StrategyType>(activeStrategy);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [onChainAllocation, setOnChainAllocation] = useState<Array<{ protocol: string; weightBps: number }> | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationUpdatedAtOnChain, setAllocationUpdatedAtOnChain] = useState<string | null>(null);

  useEffect(() => setSelected(activeStrategy), [activeStrategy]);

  useEffect(() => {
    if (currentAllocation !== undefined) {
      setOnChainAllocation(currentAllocation);
      return;
    }
    if (!userPublicKey) {
      setOnChainAllocation(null);
      return;
    }

    let cancelled = false;
    setAllocationLoading(true);
    fetchPoolAllocation(userPublicKey)
      .then((allocation) => {
        if (cancelled) return;
        setOnChainAllocation(allocation);
        setAllocationUpdatedAtOnChain(new Date().toISOString());
      })
      .catch(() => {
        if (!cancelled) setOnChainAllocation(null);
      })
      .finally(() => {
        if (!cancelled) setAllocationLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentAllocation, userPublicKey]);

  const handleSelect = async (strategyId: StrategyType) => {
    if (loading || strategyId === selected) return;
    const previousPreference = selected;
    setSelected(strategyId);
    setStatusMessage(null);

    if (!userPublicKey) {
      onSelectStrategy?.(strategyId);
      setStatusMessage('Preference selected for this session; connect a wallet to save it.');
      return;
    }

    setLoading(true);
    try {
      const result = await setUserStrategy(userPublicKey, strategyId);
      if (!result.success) throw new Error(result.error || 'The preference was not saved.');
      onSelectStrategy?.(strategyId);
      setStatusMessage(`Strategy set to ${strategyId} preference; current pool allocation may differ.`);
    } catch (err: unknown) {
      setSelected(previousPreference);
      const message = err instanceof Error ? err.message : 'Please try again.';
      setStatusMessage(`Failed to update strategy preference: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, strategyId: StrategyType) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(strategyId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">Strategy preference</h3>
          <p className="text-xs text-slate-400">This guides the agent; it does not directly change the shared pool allocation.</p>
        </div>
        {statusMessage && (
          <span role="status" className={`text-xs font-mono ${statusMessage.startsWith('Failed') ? 'text-rose-300' : 'text-emerald-400'}`}>
            {statusMessage}
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label="Investment Strategy Selector"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {STRATEGIES.map((st) => {
          const isSelected = selected === st.id;
          const Icon = st.icon;

          return (
            <div
              key={st.id}
              role="radio"
              aria-checked={isSelected}
              aria-label={`${st.name} Strategy preference`}
              aria-disabled={loading}
              tabIndex={0}
              onClick={() => { if (!loading) void handleSelect(st.id); }}
              onKeyDown={(e) => handleKeyDown(e, st.id)}
              className={`cursor-pointer rounded-2xl p-5 border transition-all relative overflow-hidden select-none focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-glow-emerald'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${
                  isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <div className="text-right">
                  <span className="text-lg font-extrabold text-white">{st.apy}%</span>
                  <span className="text-[10px] text-slate-400 block font-mono">INDICATIVE APY</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-white text-base">{st.name}</h4>
                {isSelected && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                    <Check size={10} aria-hidden="true" /> Preference selected
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                {st.description}
              </p>

              <div className="pt-3 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400 font-mono">
                <span>Risk Level:</span>
                <span className={`font-semibold ${
                  st.risk === 'Low' ? 'text-teal-400' : st.risk === 'Medium' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {st.risk}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4" aria-labelledby="pool-allocation-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 id="pool-allocation-title" className="text-sm font-semibold text-white">On-chain protocol allocation</h4>
            <p className="text-xs text-slate-400">These are the vault’s target weights for deployable assets. They may differ from your preference and do not describe an individual user’s exact positions.</p>
          </div>
          {(allocationUpdatedAt || allocationUpdatedAtOnChain) && <time className="text-xs text-slate-500" dateTime={allocationUpdatedAt || allocationUpdatedAtOnChain || undefined}>Updated {new Date(allocationUpdatedAt || allocationUpdatedAtOnChain || '').toLocaleString()}</time>}
        </div>
        {allocationLoading ? (
          <p className="mt-3 text-xs text-slate-400" role="status">Loading current on-chain weights…</p>
        ) : onChainAllocation?.length ? (
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Current protocol weights">
            {onChainAllocation.map(({ protocol, weightBps }) => (
              <li key={protocol} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
                <span className="text-slate-300">{protocol}</span>
                <strong className="font-mono text-white">{(weightBps / 100).toFixed(2)}%</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-amber-300" role="status">Current protocol weights are unavailable.</p>
        )}
      </section>
    </div>
  );
};
