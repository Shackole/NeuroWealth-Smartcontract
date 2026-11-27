'use client';

import React from 'react';
import { Clock3, Droplets, Info, Scale, Loader2 } from 'lucide-react';

export type StrategyName = 'Conservative' | 'Balanced' | 'Growth';

interface StrategyComparisonProps {
  currentStrategy?: StrategyName;
  onSelectStrategy?: (strategy: StrategyName) => void;
  isUpdating?: boolean;
}

const strategies: Record<StrategyName, {
  horizon: string;
  horizonDetail: string;
  liquidity: string;
  liquidityDetail: string;
  uncertainty: string;
  bestFor: string;
}> = {
  Conservative: {
    horizon: 'Short to medium term',
    horizonDetail: 'About 3–12 months',
    liquidity: 'High',
    liquidityDetail: 'Best when routine access matters',
    uncertainty: 'Lower return variability; stablecoin, protocol and withdrawal risks remain.',
    bestFor: 'Capital preservation',
  },
  Balanced: {
    horizon: 'Medium term',
    horizonDetail: 'About 6–24 months',
    liquidity: 'Moderate',
    liquidityDetail: 'Access can vary by pool conditions',
    uncertainty: 'Mixed return variability; lending and liquidity-pool conditions can change.',
    bestFor: 'Balanced growth',
  },
  Growth: {
    horizon: 'Long term',
    horizonDetail: 'About 12–36+ months',
    liquidity: 'Lower',
    liquidityDetail: 'May require more time or higher exit costs',
    uncertainty: 'Highest expected variability; yields, token prices and pool depth can move sharply.',
    bestFor: 'Higher growth potential',
  },
};

export const StrategyComparison: React.FC<StrategyComparisonProps> = ({
  currentStrategy,
  onSelectStrategy,
  isUpdating = false,
}) => {
  const names = Object.keys(strategies) as StrategyName[];

  return (
    <section
      id="strategy-comparison"
      aria-labelledby="strategy-comparison-heading"
      className="glass-panel rounded-2xl p-4 sm:p-6"
    >
      <div className="mb-5">
        <h2 id="strategy-comparison-heading" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
          Compare strategies
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Compare likely time horizon and withdrawal expectations before choosing a strategy.
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto" role="region" aria-label="Strategy comparison table" tabIndex={0}>
        <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
          <caption className="sr-only">Strategy time horizon, liquidity, uncertainty and ideal use</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[24%] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Comparison
              </th>
              {names.map((name) => (
                <th key={name} scope="col" className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-white">
                  {name}
                  {currentStrategy === name && (
                    <span className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Current
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Time horizon', key: 'horizon' as const, detailKey: 'horizonDetail' as const, Icon: Clock3 },
              { label: 'Liquidity expectation', key: 'liquidity' as const, detailKey: 'liquidityDetail' as const, Icon: Droplets },
              { label: 'Best suited for', key: 'bestFor' as const, detailKey: null, Icon: Scale },
              { label: 'Uncertainty', key: 'uncertainty' as const, detailKey: null, Icon: Info },
            ].map(({ label, key, detailKey, Icon }) => (
              <tr key={label} className="border-t border-slate-200 dark:border-slate-800">
                <th scope="row" className="px-4 py-4 align-top">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <Icon size={15} className="text-slate-400" />
                    {label}
                  </span>
                </th>
                {names.map((name) => (
                  <td key={name} className="px-4 py-4 align-top text-sm text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{strategies[name][key]}</span>
                    {detailKey && (
                      <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {strategies[name][detailKey]}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 md:hidden">
        {names.map((name) => {
          const strategy = strategies[name];
          const isCurrent = currentStrategy === name;
          return (
            <article
              key={name}
              aria-label={`${name} strategy comparison`}
              className={`rounded-xl border p-4 ${
                isCurrent
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900 dark:text-white">{name}</h3>
                {isCurrent && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                    Current
                  </span>
                )}
              </div>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                    <Clock3 size={14} /> Time horizon
                  </dt>
                  <dd className="mt-1 text-slate-600 dark:text-slate-400">{strategy.horizon} — {strategy.horizonDetail}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                    <Droplets size={14} /> Liquidity expectation
                  </dt>
                  <dd className="mt-1 text-slate-600 dark:text-slate-400">{strategy.liquidity} — {strategy.liquidityDetail}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                    <Scale size={14} /> Best suited for
                  </dt>
                  <dd className="mt-1 text-slate-600 dark:text-slate-400">{strategy.bestFor}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                    <Info size={14} /> Uncertainty
                  </dt>
                  <dd className="mt-1 text-slate-600 dark:text-slate-400">{strategy.uncertainty}</dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0" />
        Estimates are not guarantees. Actual yields, liquidity and losses can vary.
      </p>

      {onSelectStrategy && (
        <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {names.map((name) => (
              <button
                key={name}
                type="button"
                disabled={isUpdating || currentStrategy === name}
                onClick={() => onSelectStrategy(name)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {isUpdating && currentStrategy === name ? <Loader2 size={12} className="animate-spin" /> : null}
                {currentStrategy === name ? 'Selected' : `Choose ${name}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
