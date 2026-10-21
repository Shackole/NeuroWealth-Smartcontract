'use client';

/**
 * useVaultStatus — shared vault status subscription.
 *
 * Issue #405: Unify vault status polling across frontend components.
 *
 * ## Problem (before)
 * Every component that called `useVaultStatus()` created its own
 * `setInterval`, resulting in N parallel polls when N components were
 * mounted (e.g. VaultPauseBanner + DepositForm + dashboard widgets all
 * polling simultaneously).
 *
 * ## Solution
 * A module-level store keeps a single polling interval and a subscriber
 * count. The interval starts on the first subscriber and stops when the
 * last subscriber unmounts. All subscribers share the same state snapshot,
 * so a single status change updates every consumer simultaneously.
 *
 * Acceptance criteria (#405):
 *   ✓ Multiple consumers do not multiply poll traffic.
 *   ✓ Status changes update all consumers.
 *   ✓ Polling stops when no consumers remain.
 *
 * @example
 *   const { paused, reason, expectedResume } = useVaultStatus();
 */

import { useCallback, useEffect, useState } from 'react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface VaultStatusState {
  /** Whether the vault contract is currently paused. */
  paused: boolean;
  /** Reason text provided by the backend, or null. */
  reason: string | null;
  /** ISO-8601 expected resumption datetime, or null. */
  expectedResume: string | null;
  /** Whether the first fetch has completed. */
  loaded: boolean;
}

// ─── Module-level singleton store ────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;

const _initialState: VaultStatusState = {
  paused: false,
  reason: null,
  expectedResume: null,
  loaded: false,
};

/** Current shared vault status. */
let _state: VaultStatusState = { ..._initialState };

/** All active subscriber callbacks — notified on every state change. */
const _listeners = new Set<(state: VaultStatusState) => void>();

/** Handle for the single shared interval, or null when no consumers exist. */
let _intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Whether a fetch is already in-flight (prevents redundant concurrent calls). */
let _fetching = false;

/**
 * Publish a state update to all active subscribers.
 * Called once after every successful or failed fetch.
 */
function _notify(next: VaultStatusState) {
  _state = next;
  _listeners.forEach((cb) => cb(next));
}

/** Execute one poll cycle. Skipped if a fetch is already running. */
async function _poll(): Promise<void> {
  if (_fetching) return;
  _fetching = true;
  try {
    const res = await fetch('/api/vault/status');
    if (!res.ok) return;
    const data = (await res.json()) as {
      paused: boolean;
      reason: string | null;
      expected_resume: string | null;
    };
    _notify({
      paused: data.paused ?? false,
      reason: data.reason ?? null,
      expectedResume: data.expected_resume ?? null,
      loaded: true,
    });
  } catch {
    // Network error — mark loaded so consumers don't show indefinite spinners,
    // but leave paused/reason at whatever they were (conservative: don't flip
    // paused to false on a transient network error).
    _notify({ ..._state, loaded: true });
  } finally {
    _fetching = false;
  }
}

/**
 * Register a subscriber. Starts the shared interval on the first call.
 * Returns an unsubscribe function that stops the interval when the last
 * subscriber unregisters.
 */
function _subscribe(listener: (state: VaultStatusState) => void): () => void {
  _listeners.add(listener);

  if (_listeners.size === 1) {
    // First subscriber — fire an immediate fetch and start the interval.
    _poll();
    _intervalHandle = setInterval(_poll, POLL_INTERVAL_MS);
  }

  return () => {
    _listeners.delete(listener);
    if (_listeners.size === 0 && _intervalHandle !== null) {
      clearInterval(_intervalHandle);
      _intervalHandle = null;
    }
  };
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * Returns the current vault status and subscribes to future updates.
 *
 * The underlying poll fires at most once every 30 s regardless of how many
 * components call this hook simultaneously.
 */
export function useVaultStatus(): VaultStatusState {
  const [state, setState] = useState<VaultStatusState>(_state);

  // Stable callback reference — safe to pass to _subscribe
  const listener = useCallback((next: VaultStatusState) => {
    setState(next);
  }, []);

  useEffect(() => {
    // Sync with the current store snapshot in case it was updated between
    // hook initialisation and effect execution (e.g. during SSR hydration).
    setState(_state);

    const unsubscribe = _subscribe(listener);
    return unsubscribe;
  }, [listener]);

  return state;
}

// ─── Optional imperative trigger ─────────────────────────────────────────────

/**
 * Manually trigger a vault status refresh outside of React (e.g. after a
 * transaction that pauses the vault). All active subscribers receive the
 * update.
 */
export function refreshVaultStatus(): void {
  _poll();
}
