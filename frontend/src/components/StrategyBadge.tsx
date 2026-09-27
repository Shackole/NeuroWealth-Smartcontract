'use client';

import React from 'react';
import { Zap, TrendingUp, ShieldCheck, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StrategyBadgeProps {
  strategy: 'Conservative' | 'Balanced' | 'Growth';
  apy: number;
  onSelectStrategy?: (strategy: 'Conservative' | 'Balanced' | 'Growth') => void;
}

export const StrategyBadge: React.FC<StrategyBadgeProps> = ({ strategy, apy, onSelectStrategy }) => {
  const t = useTranslations('StrategyBadge');

  const getStrategyMeta = (s: string) => {
    switch (s) {
      case 'Conservative':
        return {
          icon: ShieldCheck,
          color: 'text-blue-400',
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          descKey: 'descriptions.conservative' as const,
        };
      case 'Growth':
        return {
          icon: Flame,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          descKey: 'descriptions.growth' as const,
        };
      default:
        return {
          icon: Zap,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          descKey: 'descriptions.balanced' as const,
        };
    }
  };

  const meta = getStrategyMeta(strategy);
  const IconComponent = meta.icon;

  // Map display name to translation key
  const strategyLabelKey = strategy.toLowerCase() as 'conservative' | 'balanced' | 'growth';

  return (
    <div className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t('title')}
          </span>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${meta.bg} ${meta.color} ${meta.border} flex items-center gap-1.5`}>
            <IconComponent size={14} />
            {t(strategyLabelKey)}
          </span>
        </div>

        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
              {apy.toFixed(1)}%
            </span>
            <span className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {t('apyLabel')}
            </span>
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1 ml-auto">
              <TrendingUp size={12} /> {t('weeklyGain')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t(meta.descKey)}</p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-xs text-slate-400">{t('optimiseQuestion')}</span>
        <div className="flex gap-1.5">
          {(['Conservative', 'Balanced', 'Growth'] as const).map((st) => (
            <button
              key={st}
              onClick={() => onSelectStrategy && onSelectStrategy(st)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                strategy === st
                  ? 'bg-slate-800 text-white border-slate-600 font-medium'
                  : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {t(st.toLowerCase() as 'conservative' | 'balanced' | 'growth')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
