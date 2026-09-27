'use client';

import React from 'react';
import { Zap, TrendingUp, ShieldCheck, Flame } from 'lucide-react';
import { TooltipInfo } from './TooltipInfo';
import { StrategyPopover } from './StrategyPopover';

interface StrategyBadgeProps {
  strategy: 'Conservative' | 'Balanced' | 'Growth';
  apy: number;
  onSelectStrategy?: (strategy: 'Conservative' | 'Balanced' | 'Growth') => void;
}

export const StrategyBadge: React.FC<StrategyBadgeProps> = ({ strategy, apy, onSelectStrategy }) => {
  const getStrategyMeta = (s: string) => {
    switch (s) {
      case 'Conservative':
        return {
          icon: ShieldCheck,
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          desc: 'Blend stablecoin lending (Low risk)'
        };
      case 'Growth':
        return {
          icon: Flame,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          desc: 'Multi-protocol DEX LP deployment (Higher yield)'
        };
      default:
        return {
          icon: Zap,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          desc: 'Optimal lending + DEX liquidity mix (Recommended)'
        };
    }
  };

  const meta = getStrategyMeta(strategy);
  const IconComponent = meta.icon;

  return (
    <div className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Current Strategy
          </span>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border} flex items-center gap-1.5`}>
            <IconComponent size={14} />
            {strategy}
          </span>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
              {apy.toFixed(1)}%
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Net APY
              <TooltipInfo
                label="What is APY?"
                content={
                  <span>
                    <strong className="text-white">Annual Percentage Yield (APY)</strong> is how much your deposit grows over a full year, including compounding. At 8% APY, 1,000 USDC becomes roughly 1,080 USDC in 12 months.{' '}
                    <a href="/learn" className="text-emerald-400 underline hover:text-emerald-300">Learn more →</a>
                  </span>
                }
              />
            </span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 ml-auto">
              <TrendingUp size={12} /> +0.4% this week
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{meta.desc}</p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-slate-400">Want to optimize risk?</span>
        <div className="flex gap-1.5 flex-wrap">
          {(['Conservative', 'Balanced', 'Growth'] as const).map((st) => (
            <span key={st} className="flex items-center gap-0.5">
              <button
                onClick={() => onSelectStrategy && onSelectStrategy(st)}
                className={`text-xs px-2.5 py-1 min-h-[44px] flex items-center rounded-md border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  strategy === st
                    ? 'bg-slate-800 text-white border-slate-600 font-medium'
                    : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:text-white'
                }`}
                aria-pressed={strategy === st}
              >
                {st}
              </button>
              <StrategyPopover strategy={st} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
