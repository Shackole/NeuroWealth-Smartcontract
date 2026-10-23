'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface TooltipInfoProps {
  /** The tooltip content shown on hover/focus */
  content: React.ReactNode;
  /** Optional label for the icon button (screen readers) */
  label?: string;
  /** Preferred opening direction */
  direction?: 'top' | 'bottom' | 'right' | 'left';
}

/**
 * Accessible info icon that shows a tooltip on hover and on keyboard focus.
 * Meets WCAG 2.1 AA: focus triggers tooltip, role="tooltip", aria-describedby.
 */
export const TooltipInfo: React.FC<TooltipInfoProps> = ({
  content,
  label = 'More information',
  direction = 'top',
}) => {
  const [open, setOpen] = useState(false);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2)}`).current;
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const positionClasses: Record<string, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  };

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <Info size={14} aria-hidden="true" />
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 w-64 text-xs text-slate-200 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl pointer-events-none ${positionClasses[direction]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
};
