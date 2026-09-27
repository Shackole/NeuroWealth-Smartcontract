'use client';

import React, { useState } from 'react';
import { ShieldCheck, Zap, TrendingUp, Check } from 'lucide-react';
import { setUserStrategy } from '@/lib/contract';

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
    description: '100% Blend lending pool allocation prioritizing principal safety and steady yield.',
    icon: ShieldCheck
  },
  {
    id: 'balanced',
    name: 'Balanced',
    apy: 8.4,
    risk: 'Medium',
    description: 'Dynamic allocation between Blend and DEX pools automated by AI rebalancing.',
    icon: Zap
  },
  {
    id: 'growth',
    name: 'Growth',
    apy: 12.1,
    risk: 'High',
    description: 'Aggressive multi-protocol yield farming maximizing compound returns.',
    icon: TrendingUp
  }
];

export interface StrategySelectorProps {
  userPublicKey?: string | null;
  activeStrategy?: StrategyType;
  onSelectStrategy?: (strategy: StrategyType) => void;
}

export const StrategySelector: React.FC<StrategySelectorProps> = ({
  userPublicKey,
  activeStrategy = 'balanced',
  onSelectStrategy
}) => {
  const [selected, setSelected] = useState<StrategyType>(activeStrategy);
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSelect = async (strategyId: StrategyType) => {
    setSelected(strategyId);
    setStatusMessage(null);

    if (onSelectStrategy) {
      onSelectStrategy(strategyId);
    }

    if (userPublicKey) {
      setLoading(true);
      try {
        await setUserStrategy(userPublicKey, strategyId);
        setStatusMessage(`Strategy set to ${strategyId.toUpperCase()}`);
      } catch (err: any) {
        setStatusMessage(`Failed to update strategy: ${err.message}`);
      } finally {
        setLoading(false);
      }
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Investment Strategy</h3>
          <p className="text-xs text-slate-400">Select how autonomous AI deploys your deposited assets</p>
        </div>
        {statusMessage && (
          <span role="status" className="text-xs text-emerald-400 font-mono">
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
              aria-label={`${st.name} Strategy`}
              tabIndex={0}
              onClick={() => handleSelect(st.id)}
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
                  <span className="text-[10px] text-slate-400 block font-mono">EST. APY</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-white text-base">{st.name}</h4>
                {isSelected && (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                    <Check size={10} aria-hidden="true" /> Active
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
    </div>
  );
};
