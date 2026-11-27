'use client';

import React, { useState, useRef, useId } from 'react';
import { Copy, Check, AlertCircle, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { shortenAddress } from '@/lib/stellar';

export interface AddressCopyButtonProps {
  address: string;
  label?: string;
  showFullAddressToggle?: boolean;
  className?: string;
}

export const AddressCopyButton: React.FC<AddressCopyButtonProps> = ({
  address,
  label = 'Stellar Address',
  showFullAddressToggle = true,
  className = '',
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'failure'>('idle');
  const [isExpanded, setIsExpanded] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const elementId = useId();

  const handleCopy = async (triggeredBy: 'mouse' | 'keyboard' | 'touch') => {
    let success = false;

    // Modern Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(address);
        success = true;
      } catch (err) {
        console.warn('Clipboard writeText failed:', err);
      }
    }

    // Fallback: execCommand
    if (!success && typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = address;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.warn('execCommand copy failed:', err);
      }
    }

    // Haptic feedback for touch devices
    if (triggeredBy === 'touch' && typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch {
        // ignore
      }
    }

    if (success) {
      setCopyStatus('success');
      const announcement = `Copied ${label} (${shortenAddress(address)}) to clipboard via ${triggeredBy}.`;
      setLiveAnnouncement(announcement);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopyStatus('idle');
        setLiveAnnouncement('');
      }, 2500);
    } else {
      setCopyStatus('failure');
      setLiveAnnouncement('Clipboard copy failed. Full address is displayed below for manual selection.');
      setIsExpanded(true);
      setTimeout(() => {
        fallbackInputRef.current?.focus();
        fallbackInputRef.current?.select();
      }, 50);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopyStatus('idle');
      }, 4000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCopy('keyboard');
    }
  };

  return (
    <div className={`relative inline-flex flex-col gap-1.5 ${className}`}>
      {/* Screen Reader Live Region */}
      <div className="sr-only" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <div className="flex items-center gap-2">
        {/* Copy Trigger Button */}
        <button
          type="button"
          onClick={() => handleCopy('mouse')}
          onTouchEnd={() => handleCopy('touch')}
          onKeyDown={handleKeyDown}
          aria-label={`Copy full address for ${label}: ${shortenAddress(address)}`}
          className={`group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-mono transition-all select-none min-h-[36px] sm:min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 active:scale-95 ${
            copyStatus === 'success'
              ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-300 shadow-sm'
              : copyStatus === 'failure'
              ? 'border-amber-500/60 bg-amber-950/30 text-amber-300'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
          }`}
        >
          {copyStatus === 'success' ? (
            <>
              <Check size={14} className="text-emerald-400 stroke-[2.5]" aria-hidden="true" />
              <span className="font-sans font-medium text-emerald-400">Copied!</span>
            </>
          ) : copyStatus === 'failure' ? (
            <>
              <AlertCircle size={14} className="text-amber-400" aria-hidden="true" />
              <span className="font-sans font-medium text-amber-300">Copy Failed</span>
            </>
          ) : (
            <>
              <Copy size={13} className="text-slate-400 group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
              <span>{shortenAddress(address)}</span>
            </>
          )}
        </button>

        {/* Toggle Full Address Button */}
        {showFullAddressToggle && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-controls={`${elementId}-full-address`}
            aria-label={`${isExpanded ? 'Hide' : 'Inspect'} full 56-character address`}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1.5 rounded border border-transparent hover:border-slate-700 hover:bg-slate-800/60 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
          >
            <Eye size={12} aria-hidden="true" />
            <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Inspect'}</span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Floating Success Confirmation Toast for Touch / Mobile */}
      {copyStatus === 'success' && (
        <div
          role="status"
          className="absolute left-0 top-full mt-1.5 z-20 flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-2.5 py-1 text-[11px] font-sans text-emerald-200 shadow-xl backdrop-blur-sm animate-fadeIn"
        >
          <Check size={12} className="text-emerald-400 shrink-0" aria-hidden="true" />
          <span>Full 56-character address copied</span>
        </div>
      )}

      {/* Expanded View & Manual Select Fallback */}
      {isExpanded && (
        <div
          id={`${elementId}-full-address`}
          className="mt-1.5 w-full max-w-sm rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs animate-fadeIn"
        >
          <div className="flex items-center justify-between mb-1 text-[10px] uppercase font-semibold text-slate-400">
            <span>Full Public Key</span>
            <span className="font-mono text-emerald-400">56 chars</span>
          </div>
          <input
            ref={fallbackInputRef}
            type="text"
            readOnly
            value={address}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="w-full rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-200 select-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
            aria-label="Full Stellar address for manual selection"
          />
          {copyStatus === 'failure' && (
            <p className="mt-1 text-[10px] text-amber-300">
              Automatic copy blocked by browser. Please press <kbd className="px-1 rounded bg-slate-800">Ctrl+C</kbd> or long-press to copy.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
