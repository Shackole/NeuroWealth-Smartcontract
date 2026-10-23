'use client';

import React from 'react';

interface SkeletonCardProps {
  /** Height class, e.g. 'h-72'. Defaults to 'h-48'. */
  height?: string;
  className?: string;
}

/**
 * Shimmer skeleton placeholder shown while async data is loading.
 * The shimmer animation is suppressed for users who prefer reduced motion.
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  height = 'h-48',
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      className={`glass-panel rounded-2xl overflow-hidden relative ${height} ${className}`}
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 skeleton-shimmer" />

      {/* Fake content lines */}
      <div className="p-6 flex flex-col gap-4">
        <div className="h-4 w-1/3 rounded bg-slate-700/60" />
        <div className="h-3 w-2/3 rounded bg-slate-700/40" />
        <div className="h-3 w-1/2 rounded bg-slate-700/40" />
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
};
