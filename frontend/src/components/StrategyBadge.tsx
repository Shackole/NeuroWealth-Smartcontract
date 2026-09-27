'use client';

import React from 'react';
import { Zap, TrendingUp, ShieldCheck, Flame } from 'lucide-react';

interface StrategyBadgeProps {
  strategy: 'Conservative' | 'Balanced' | 'Growth';
  apy: number;
  onSelectStrategy?: (strategy: 'Conservative' | 'Balanced' | 'Growth') => void;
}

/*
 * Strategy colours chosen for CVD safety (deuteranopia + protanopia).
 * Each strategy also carries a DISTINCT ICON so colour is never the sole
 * differentiator (WCAG SC 1.4.1 — Use of Color).
 *
 *   Conservative → Blue  + ShieldCheck icon
 *   Balanced     → Teal  + Zap icon         (changed from emerald for CVD safety)
 *   Growth       → Amber + Flame icon
 *
 * Reference: docs/CVD_PALETTE.md
 */
const STRATEGY_META = {
  Conservative: {
    icon: ShieldCheck,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    activeBorder: 'border-blue-400',
    desc: 'Blend stablecoin lending — Low risk, ~3–6% APY',
    ariaDesc: 'Conservative: low risk stablecoin lending on Blend, approximately 3 to 6 percent APY',
  },
  Balanced: {
    // Teal replaces emerald — better separation from amber/Growth under CVD
    icon: Zap,
    color: 'text-teal-400',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    activeBorder: 'border-teal-400',
    desc: 'Optimal lending + DEX liquidity mix — Recommended, ~6–10% APY',
    ariaDesc: 'Balanced: medium risk mix of lending and DEX liquidity, approximately 6 to 10 percent APY, recommended',
  },
  Growth: {
    icon: Flame,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    activeBorder: 'border-amber-400',
    desc: 'Multi-protocol DEX LP deployment — Higher yield, ~10–15% APY',
    ariaDesc: 'Growth: higher risk multi-protocol DEX deployment, approximately 10 to 15 percent APY',
  },
} as const;

export const StrategyBadge: React.FC<StrategyBadgeProps> = ({
  strategy,
  apy,
  onSelectStrategy,
}) => {
  const meta = STRATEGY_META[strategy];
  const IconComponent = meta.icon;

  return (
    <div className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Current Strategy
          </span>
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border} flex items-center gap-1.5`}
            aria-label={meta.ariaDesc}
          >
            <IconComponent size={14} aria-hidden="true" />
            {strategy}
          </span>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
              {apy.toFixed(1)}%
            </span>
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Net APY
            </span>
            <span className="text-xs font-medium text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 flex items-center gap-1 ml-auto">
              <TrendingUp size={12} aria-hidden="true" /> +0.4% this week
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{meta.desc}</p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-xs text-slate-400">Want to optimize risk?</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Select investment strategy">
          {(['Conservative', 'Balanced', 'Growth'] as const).map((st) => {
            const stMeta = STRATEGY_META[st];
            const StIcon = stMeta.icon;
            const isActive = strategy === st;
            return (
              <button
                key={st}
                onClick={() => onSelectStrategy && onSelectStrategy(st)}
                role="radio"
                aria-checked={isActive}
                aria-label={stMeta.ariaDesc}
                title={stMeta.desc}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-all duration-150 ease-in-out ${
                  isActive
                    ? `${stMeta.bg} ${stMeta.color} ${stMeta.activeBorder} font-medium scale-105`
                    : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:text-white hover:border-slate-600'
                }`}
              >
                {/* Icon in the button ensures strategy is never identified by colour alone */}
                <StIcon size={12} aria-hidden="true" />
                <span>{st}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
