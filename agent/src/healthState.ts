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
