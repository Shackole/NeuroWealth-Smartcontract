'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Zap, Flame, Info, Check, Loader2, type LucideIcon } from 'lucide-react';
import { signWithFreighter } from '@/lib/freighter';

// ─── Strategy data (static constants matching README) ─────────────────────────
export type Strategy = 'Conservative' | 'Balanced' | 'Growth';

interface StrategyMeta {
  id: Strategy;
  label: string;
  apyRange: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  description: string;
  icon: LucideIcon;
  accentColor: string;
  bgColor: string;
  borderColor: string;
  riskBadgeColor: string;
}

const STRATEGIES: StrategyMeta[] = [
  {
    id: 'Conservative',
    label: 'Conservative',
    apyRange: '3–6%',
    riskLevel: 'Low',
    description: 'Stablecoin lending on Blend Protocol. Predictable returns with minimal exposure to volatility.',
    icon: ShieldCheck,
    accentColor: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/40',
    riskBadgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  {
    id: 'Balanced',
    label: 'Balanced',
    apyRange: '6–10%',
    riskLevel: 'Medium',
    description: 'Mix of stablecoin lending and DEX liquidity provision. Optimal risk-to-reward ratio.',
    icon: Zap,
    accentColor: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/40',
    riskBadgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'Growth',
    label: 'Growth',
    apyRange: '10–15%',
    riskLevel: 'High',
    description: 'Aggressive multi-protocol deployment across Blend and DEX pools for maximum yield.',
    icon: Flame,
    accentColor: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/40',
    riskBadgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
];

// ─── Tooltip ───────────────────────────────────────────────────────────────────
function AdvisoryTooltip() {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        aria-label="Strategy advisory information"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-slate-500 hover:text-slate-300 transition-colors"
      >
        <Info size={14} />
      </button>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 w-64 z-50 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl text-xs text-slate-300 leading-relaxed"
            role="tooltip"
          >
            <p className="font-semibold text-white mb-1">Advisory only</p>
            Your strategy preference is stored on-chain as a signal for the AI
            agent. Actual fund deployment is managed autonomously by the vault
            — your selected strategy informs the agent&apos;s allocation decisions
            but does not directly control where funds are deployed.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Individual strategy card ──────────────────────────────────────────────────
interface CardProps {
  strategy: StrategyMeta;
  isActive: boolean;
  isLoading: boolean;
  onSelect: () => void;
}

function StrategyCard({ strategy, isActive, isLoading, onSelect }: CardProps) {
  const Icon = strategy.icon;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      disabled={isLoading}
      aria-pressed={isActive}
      aria-label={`Select ${strategy.label} strategy`}
      className={`relative flex flex-col text-left p-4 rounded-2xl border-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed w-full ${
        isActive
          ? `${strategy.bgColor} ${strategy.borderColor} shadow-lg`
          : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 hover:bg-slate-800/60'
      }`}
    >
      {/* Active checkmark */}
      {isActive && (
        <span
          className={`absolute top-3 right-3 h-5 w-5 rounded-full flex items-center justify-center ${strategy.bgColor} ${strategy.accentColor}`}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}

      {/* Loading spinner overlay */}
      {isLoading && isActive && (
        <span className="absolute top-3 right-3">
          <Loader2 size={16} className={`${strategy.accentColor} animate-spin`} />
        </span>
      )}

      {/* Icon */}
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-3 ${strategy.bgColor}`}>
        <Icon size={18} className={strategy.accentColor} />
      </div>

      {/* Title + APY */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-bold text-white text-sm">{strategy.label}</span>
        <span className={`font-extrabold text-lg font-mono ${strategy.accentColor}`}>
          {strategy.apyRange}
        </span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mb-3">
        {strategy.description}
      </p>

      {/* Risk badge */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${strategy.riskBadgeColor}`}
      >
        {strategy.riskLevel} Risk
      </span>

      {/* APY label */}
      <p className="text-[10px] text-slate-500 mt-2">APY range (estimated)</p>
    </motion.button>
  );
}

// ─── Main StrategySelector export ─────────────────────────────────────────────
interface StrategySelectorProps {
  publicKey: string | null;
  currentStrategy: Strategy;
  apy: number;
  onStrategyChange: (strategy: Strategy) => void;
}

export const StrategySelector: React.FC<StrategySelectorProps> = ({
  publicKey,
  currentStrategy,
  apy,
  onStrategyChange,
}) => {
  // Optimistic selection — shown immediately; reverted on tx failure
  const [optimisticStrategy, setOptimisticStrategy] = useState<Strategy | null>(null);
  const [pendingStrategy, setPendingStrategy] = useState<Strategy | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const displayStrategy = optimisticStrategy ?? currentStrategy;

  async function handleSelectStrategy(strategy: Strategy) {
    if (!publicKey || strategy === displayStrategy) return;

    // Optimistic UI update
    setOptimisticStrategy(strategy);
    setPendingStrategy(strategy);
    setTxError(null);
    onStrategyChange(strategy);

    try {
      /**
       * In a full integration, we'd build a Soroban transaction that calls
       * set_user_strategy(user, strategy) on the vault contract.
       * For now, we simulate the signing step. The vault contract call can be
       * wired up once the Soroban RPC endpoint is configured.
       *
       * Placeholder XDR — replace with real transaction built via stellar-sdk:
       * const tx = await buildSetStrategyTx(publicKey, strategy);
       * const signedXdr = await signWithFreighter(tx.toXDR(), NETWORK_PASSPHRASE);
       */
      const PLACEHOLDER_XDR = ''; // will be replaced with real Soroban tx
      if (PLACEHOLDER_XDR) {
        const signed = await signWithFreighter(PLACEHOLDER_XDR);
        if (!signed) {
          throw new Error('Transaction rejected by user');
        }
        // TODO: submit signed XDR to Soroban RPC
      }

      // Strategy committed successfully (optimistic update stays)
    } catch (err: unknown) {
      // Revert optimistic update on failure
      const message = err instanceof Error ? err.message : 'Transaction failed';
      setTxError(message);
      setOptimisticStrategy(null);
      onStrategyChange(currentStrategy);
    } finally {
      setPendingStrategy(null);
    }
  }

  return (
    <div className="glass-panel-interactive rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Investment Strategy
            </span>
            <AdvisoryTooltip />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Current APY:{' '}
            <span className="text-emerald-400 font-semibold">{apy.toFixed(1)}%</span>
          </p>
        </div>
        {!publicKey && (
          <span className="text-[10px] text-slate-500 italic">Connect wallet to change</span>
        )}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3">
        {STRATEGIES.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            isActive={displayStrategy === strategy.id}
            isLoading={pendingStrategy === strategy.id}
            onSelect={() => handleSelectStrategy(strategy.id)}
          />
        ))}
      </div>

      {/* Error */}
      {txError && (
        <p role="alert" className="text-xs text-red-400 text-center mt-1">
          ⚠ {txError}. Strategy reverted.
        </p>
      )}

      {/* Pending state message */}
      {pendingStrategy && (
        <p className="text-xs text-slate-400 text-center animate-pulse">
          Submitting strategy to the Soroban vault…
        </p>
      )}
    </div>
  );
};
