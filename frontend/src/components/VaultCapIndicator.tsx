'use client';

import React from 'react';
import { AlertTriangle, TrendingUp, User, Lock } from 'lucide-react';

export interface VaultCapData {
  tvlCap: number;
  totalDeposits: number;
  userDepositCap: number;
  userDeposits: number;
}

interface VaultCapIndicatorProps {
  capData: VaultCapData;
}

function CapProgressBar({
  label,
  used,
  cap,
  icon,
  warnColor,
}: {
  label: string;
  used: number;
  cap: number;
  icon: React.ReactNode;
  warnColor: 'amber' | 'emerald';
}) {
  const pct = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;
  const remaining = Math.max(cap - used, 0);
  const isNearCap = pct >= 90;
  const isFull = pct >= 100;

  const barColor = isFull
    ? 'bg-red-500'
    : isNearCap
    ? 'bg-amber-500'
    : warnColor === 'emerald'
    ? 'bg-emerald-500'
    : 'bg-indigo-500';

  const textColor = isFull
    ? 'text-red-400'
    : isNearCap
    ? 'text-amber-400'
    : warnColor === 'emerald'
    ? 'text-emerald-400'
    : 'text-indigo-400';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-400 font-medium">
          {icon}
          {label}
        </span>
        <span className={`font-mono font-semibold ${textColor}`}>
          {used.toLocaleString('en-US', { maximumFractionDigits: 2 })} /{' '}
          {cap.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC
        </span>
      </div>

      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${pct.toFixed(1)}% used`}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{pct.toFixed(1)}% used</span>
        {isFull ? (
          <span className="text-red-400 font-semibold">Cap reached</span>
        ) : (
          <span className={textColor}>
            {remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC remaining
          </span>
        )}
      </div>
    </div>
  );
}

export const VaultCapIndicator: React.FC<VaultCapIndicatorProps> = ({ capData }) => {
  const { tvlCap, totalDeposits, userDepositCap, userDeposits } = capData;

  const tvlPct = tvlCap > 0 ? (totalDeposits / tvlCap) * 100 : 0;
  const userPct = userDepositCap > 0 ? (userDeposits / userDepositCap) * 100 : 0;

  const tvlFull = tvlPct >= 100;
  const userNearCap = userPct >= 90 && userPct < 100;
  const userFull = userPct >= 100;

  return (
    <div className="space-y-4">
      {/* TVL full warning */}
      {tvlFull && (
        <div
          className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-300"
          role="alert"
        >
          <Lock size={14} className="shrink-0 mt-0.5 text-red-400" />
          <div>
            <span className="font-semibold text-red-300">Vault is at full capacity.</span>{' '}
            Deposits are paused until the TVL cap is raised by the vault owner.
          </div>
        </div>
      )}

      {/* User near personal cap warning */}
      {userNearCap && !userFull && (
        <div
          className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300"
          role="alert"
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          <div>
            <span className="font-semibold text-amber-300">Approaching your personal deposit cap.</span>{' '}
            You can deposit{' '}
            <span className="font-mono font-semibold">
              {(userDepositCap - userDeposits).toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
            </span>{' '}
            more before reaching your limit.
          </div>
        </div>
      )}

      {/* TVL Progress Bar */}
      <CapProgressBar
        label="Vault TVL"
        used={totalDeposits}
        cap={tvlCap}
        icon={<TrendingUp size={12} />}
        warnColor="emerald"
      />

      {/* User Cap Progress Bar */}
      <CapProgressBar
        label="Your deposit cap"
        used={userDeposits}
        cap={userDepositCap}
        icon={<User size={12} />}
        warnColor="emerald"
      />
    </div>
  );
};
