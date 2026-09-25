'use client';

import React from 'react';

/** A single animated skeleton block */
function SkeletonBlock({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse bg-slate-700/50 dark:bg-slate-700/50 bg-slate-200 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton for the BalanceCard */
export function BalanceCardSkeleton() {
  return (
    <div
      className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden"
      aria-label="Loading balance…"
      role="status"
    >
      <div className="flex items-center justify-between mb-4">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-6 w-32 rounded-full" />
      </div>
      <div className="mb-6 space-y-2">
        <SkeletonBlock className="h-10 w-48" />
        <SkeletonBlock className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-12 rounded-xl" />
        <SkeletonBlock className="h-12 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for the EarningsCard */
export function EarningsCardSkeleton() {
  return (
    <div
      className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between"
      aria-label="Loading earnings…"
      role="status"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-8 w-36 rounded-lg" />
        </div>
        <SkeletonBlock className="h-10 w-40 mb-2" />
        <SkeletonBlock className="h-4 w-56" />
      </div>
      <div className="pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2">
        <SkeletonBlock className="h-14 rounded-lg" />
        <SkeletonBlock className="h-14 rounded-lg" />
        <SkeletonBlock className="h-14 rounded-lg" />
      </div>
    </div>
  );
}

/** Skeleton for the StrategyBadge */
export function StrategyCardSkeleton() {
  return (
    <div
      className="glass-panel-interactive rounded-2xl p-6 relative overflow-hidden"
      aria-label="Loading strategy…"
      role="status"
    >
      <div className="flex items-center justify-between mb-4">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-6 w-20 rounded-full" />
      </div>
      <SkeletonBlock className="h-10 w-32 mb-2" />
      <SkeletonBlock className="h-4 w-40 mb-6" />
      <div className="space-y-2">
        <SkeletonBlock className="h-12 rounded-xl" />
        <SkeletonBlock className="h-12 rounded-xl" />
        <SkeletonBlock className="h-12 rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for the PortfolioChart */
export function ChartSkeleton() {
  return (
    <div
      className="glass-panel rounded-2xl p-6"
      aria-label="Loading chart…"
      role="status"
    >
      <div className="flex items-center justify-between mb-6">
        <SkeletonBlock className="h-6 w-48" />
        <SkeletonBlock className="h-8 w-32 rounded-lg" />
      </div>
      <SkeletonBlock className="h-56 w-full rounded-xl" />
    </div>
  );
}
