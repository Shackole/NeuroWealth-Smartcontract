'use client';

/**
 * VaultPauseBanner
 *
 * Displays a site-wide amber banner when the vault is paused.
 * - Polls /api/vault/status every 30 seconds
 * - Stacks above the navigation bar (sticky, no content shift)
 * - Dismissible per-session for non-critical pauses
 * - Communicates reason and expected resolution time when available
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface VaultStatus {
  paused: boolean;
  reason: string | null;
  expected_resume: string | null;
}

const SESSION_KEY = 'nw_pause_banner_dismissed';
const POLL_INTERVAL_MS = 30_000;

function formatResume(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const date = new Date(iso);
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return null;
    const diffH = Math.floor(diffMs / 3_600_000);
    const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
    if (diffH >= 1) return `~${diffH} hour${diffH > 1 ? 's' : ''}`;
    if (diffM >= 1) return `~${diffM} minute${diffM > 1 ? 's' : ''}`;
    return 'shortly';
  } catch {
    return null;
  }
}

export function VaultPauseBanner() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/status');
      if (!res.ok) return;
      const data: VaultStatus = await res.json();
      setStatus(data);
      // Re-show banner if vault paused again after a previous dismissal
      if (data.paused) {
        const wasDismissed = sessionStorage.getItem(SESSION_KEY);
        if (!wasDismissed) setDismissed(false);
      }
    } catch {
      // silent — don't disrupt UX on network error
    }
  }, []);

  useEffect(() => {
    // Check session dismissal state on mount
    if (typeof window !== 'undefined') {
      const wasDismissed = sessionStorage.getItem(SESSION_KEY) === '1';
      setDismissed(wasDismissed);
    }

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(SESSION_KEY, '1');
  };

  if (!status?.paused || dismissed) return null;

  const resumeIn = formatResume(status.expected_resume);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="sticky top-0 z-50 w-full bg-amber-500/95 text-amber-950 backdrop-blur-sm"
      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <AlertTriangle
            size={18}
            className="flex-shrink-0 mt-0.5 sm:mt-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight">
              Vault is temporarily paused — withdrawals and deposits are disabled.
              Funds are safe.
            </p>
            <p className="text-xs mt-0.5 opacity-80 leading-tight">
              {status.reason
                ? `Reason: ${status.reason}.`
                : 'The vault owner has triggered an emergency pause.'}
              {resumeIn && ` Expected resolution: ${resumeIn}.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-amber-600/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-900"
          aria-label="Dismiss pause notification"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
