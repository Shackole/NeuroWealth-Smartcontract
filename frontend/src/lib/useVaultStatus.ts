'use client';

/**
 * useVaultStatus
 *
 * Polls /api/vault/status every 30 seconds and returns the current vault
 * pause state. Components can use this hook to disable deposit/withdraw
 * buttons and show tooltips when the vault is paused.
 *
 * @example
 *   const { paused, reason, expectedResume } = useVaultStatus();
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VaultStatusState {
  /** Whether the vault contract is currently paused */
  paused: boolean;
  /** Reason text provided by the backend, or null */
  reason: string | null;
  /** ISO-8601 expected resumption datetime, or null */
  expectedResume: string | null;
  /** Whether the first fetch has completed */
  loaded: boolean;
}

const POLL_INTERVAL_MS = 30_000;

export function useVaultStatus(): VaultStatusState {
  const [state, setState] = useState<VaultStatusState>({
    paused: false,
    reason: null,
    expectedResume: null,
    loaded: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/status');
      if (!res.ok) return;
      const data = await res.json() as {
        paused: boolean;
        reason: string | null;
        expected_resume: string | null;
      };
      setState({
        paused: data.paused ?? false,
        reason: data.reason ?? null,
        expectedResume: data.expected_resume ?? null,
        loaded: true,
      });
    } catch {
      setState((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

  useEffect(() => {
    fetch_();
    intervalRef.current = setInterval(fetch_, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch_]);

  return state;
}
