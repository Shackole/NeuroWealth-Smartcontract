/**
 * Shared health-state module.
 *
 * Scheduler and other subsystems write here so the /health endpoint can
 * report live operational data without circular imports.
 */

/** Unix timestamp (ms) of the most recent successful rebalance. */
export let lastRebalanceTimestamp: number | null = null;

/** Current depth of the rebalance job queue (updated by the scheduler). */
export let queueDepth: number = 0;

export function setLastRebalanceTimestamp(ts: number): void {
  lastRebalanceTimestamp = ts;
}

export function setQueueDepth(depth: number): void {
  queueDepth = depth;
}

/** Shares one RPC probe and caches its result for a short window after completion. */
export function cacheRpcHealthProbe<T>(probe: () => Promise<T>, ttlMs = 5_000): () => Promise<T> {
  let cached: { result: T; expiresAt: number } | undefined;
  let inFlight: Promise<T> | undefined;

  return () => {
    if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.result);

    inFlight ??= Promise.resolve().then(probe).then((result) => {
      cached = { result, expiresAt: Date.now() + ttlMs };
      return result;
    }).finally(() => {
      inFlight = undefined;
    });

    return inFlight;
  };
}
