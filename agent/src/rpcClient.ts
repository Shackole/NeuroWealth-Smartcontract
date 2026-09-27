/**
 * Resilient Stellar RPC client with circuit breaker and latency tracking (Issue #122).
 *
 * Supports a primary and a fallback RPC endpoint. If the primary fails 3 times
 * within a 60-second window the circuit opens and all requests are routed to
 * the fallback. After a 30-second reset interval the circuit half-opens and
 * probes the primary again.
 *
 * RPC latency is tracked via the existing MetricsEngine pattern and emitted as
 * structured log fields so the Prometheus scraper in infra/metrics/metrics.js
 * can pick them up through the `stellar_rpc_latency_seconds` histogram already
 * defined there.
 *
 * Configuration via environment variables:
 *   SOROBAN_RPC_URL          Primary endpoint   (default: Stellar public testnet)
 *   SOROBAN_RPC_URL_FALLBACK Fallback endpoint  (default: Stellar public mainnet horizon)
 */

import { rpc as SorobanRpc } from '@stellar/stellar-sdk';
import logger from './logger';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIMARY_RPC_URL =
  process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const FALLBACK_RPC_URL =
  process.env.SOROBAN_RPC_URL_FALLBACK ??
  'https://soroban-mainnet.stellar.org';

/** Number of failures in the window before the circuit opens. */
const FAILURE_THRESHOLD = 3;
/** Window (ms) in which failures are counted. */
const FAILURE_WINDOW_MS = 60_000;
/** How long the circuit stays open before probing again (ms). */
const RESET_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Circuit-breaker state
// ---------------------------------------------------------------------------

type CircuitState = 'closed' | 'open' | 'half-open';

interface EndpointState {
  url: string;
  server: SorobanRpc.Server;
  state: CircuitState;
  failureTimes: number[];   // epoch ms of recent failures
  openedAt: number | null;  // epoch ms when circuit last opened
}

function makeEndpoint(url: string): EndpointState {
  return {
    url,
    server: new SorobanRpc.Server(url),
    state: 'closed',
    failureTimes: [],
    openedAt: null,
  };
}

const primary: EndpointState = makeEndpoint(PRIMARY_RPC_URL);
const fallback: EndpointState = makeEndpoint(FALLBACK_RPC_URL);

// ---------------------------------------------------------------------------
// Circuit-breaker logic
// ---------------------------------------------------------------------------

function pruneOldFailures(ep: EndpointState): void {
  const cutoff = Date.now() - FAILURE_WINDOW_MS;
  ep.failureTimes = ep.failureTimes.filter((t) => t >= cutoff);
}

function recordSuccess(ep: EndpointState): void {
  ep.failureTimes = [];
  if (ep.state !== 'closed') {
    logger.info({ rpcUrl: ep.url, previousState: ep.state }, 'RPC circuit closed — endpoint recovered');
  }
  ep.state = 'closed';
  ep.openedAt = null;
}

function recordFailure(ep: EndpointState): void {
  const now = Date.now();
  ep.failureTimes.push(now);
  pruneOldFailures(ep);

  if (ep.failureTimes.length >= FAILURE_THRESHOLD && ep.state === 'closed') {
    ep.state = 'open';
    ep.openedAt = now;
    logger.warn(
      {
        rpcUrl: ep.url,
        failures: ep.failureTimes.length,
        windowMs: FAILURE_WINDOW_MS,
      },
      `RPC circuit opened — ${ep.failureTimes.length} failures in ${FAILURE_WINDOW_MS}ms`,
    );
  }
}

function isAvailable(ep: EndpointState): boolean {
  if (ep.state === 'closed') return true;
  if (ep.state === 'open') {
    const elapsed = Date.now() - (ep.openedAt ?? 0);
    if (elapsed >= RESET_INTERVAL_MS) {
      ep.state = 'half-open';
      logger.info({ rpcUrl: ep.url, elapsedMs: elapsed }, 'RPC circuit half-open — probing primary');
      return true;
    }
    return false;
  }
  // half-open: allow one probe
  return true;
}

// ---------------------------------------------------------------------------
// Latency tracking
// ---------------------------------------------------------------------------

interface LatencySample {
  url: string;
  durationMs: number;
  success: boolean;
  at: number;
}

const latencySamples: LatencySample[] = [];
const MAX_SAMPLES = 1_000;

function recordLatency(url: string, durationMs: number, success: boolean): void {
  latencySamples.push({ url, durationMs, success, at: Date.now() });
  if (latencySamples.length > MAX_SAMPLES) {
    latencySamples.splice(0, latencySamples.length - MAX_SAMPLES);
  }
  logger.debug(
    { rpc_url: url, rpc_latency_ms: durationMs, rpc_success: success },
    'rpc_request_duration_ms',
  );
}

/** Returns p50/p95/p99 latency in ms for the given endpoint URL over the last 5 minutes. */
export function getRpcLatencyPercentiles(url?: string): {
  p50: number; p95: number; p99: number; count: number;
} {
  const cutoff = Date.now() - 5 * 60_000;
  const relevant = latencySamples.filter(
    (s) => s.at >= cutoff && (url == null || s.url === url),
  );
  if (relevant.length === 0) return { p50: 0, p95: 0, p99: 0, count: 0 };
  const sorted = relevant.map((s) => s.durationMs).sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
  return { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), count: sorted.length };
}

// ---------------------------------------------------------------------------
// Timed RPC call wrapper
// ---------------------------------------------------------------------------

async function timedCall<T>(
  ep: EndpointState,
  fn: (server: SorobanRpc.Server) => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn(ep.server);
    const durationMs = Date.now() - start;
    recordLatency(ep.url, durationMs, true);
    recordSuccess(ep);
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    recordLatency(ep.url, durationMs, false);
    recordFailure(ep);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the best available SorobanRpc.Server instance, routing through the
 * circuit breaker. If the primary circuit is open the fallback is used.
 *
 * Usage:
 *   const { server, endpoint } = getActiveEndpoint();
 *   const ledger = await server.getLatestLedger();
 */
export function getActiveEndpoint(): { server: SorobanRpc.Server; endpoint: string } {
  pruneOldFailures(primary);
  if (isAvailable(primary)) {
    return { server: primary.server, endpoint: primary.url };
  }
  logger.warn(
    { primaryUrl: primary.url, fallbackUrl: fallback.url },
    'Primary RPC unavailable — routing to fallback',
  );
  return { server: fallback.server, endpoint: fallback.url };
}

/**
 * Executes `fn` against the best available endpoint, tracking latency and
 * updating the circuit breaker on success/failure. Automatically retries once
 * on the fallback if the primary fails and is not yet circuited open.
 */
export async function rpcCall<T>(
  fn: (server: SorobanRpc.Server) => Promise<T>,
): Promise<T> {
  pruneOldFailures(primary);

  if (isAvailable(primary)) {
    try {
      return await timedCall(primary, fn);
    } catch (err) {
      // Primary just tripped — try fallback immediately
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), fallbackUrl: fallback.url },
        'Primary RPC call failed — retrying on fallback',
      );
    }
  }

  // Fallback attempt
  return timedCall(fallback, fn);
}

/**
 * Convenience: returns the active SorobanRpc.Server (primary or fallback).
 * Callers that need a bare Server object (e.g. eventListener) can use this.
 */
export function getRpcServer(): SorobanRpc.Server {
  return getActiveEndpoint().server;
}

/** Exposes internal circuit state for health endpoints. */
export function getRpcCircuitStatus(): {
  primary: { url: string; state: CircuitState; recentFailures: number };
  fallback: { url: string; state: CircuitState; recentFailures: number };
} {
  pruneOldFailures(primary);
  pruneOldFailures(fallback);
  return {
    primary: { url: primary.url, state: primary.state, recentFailures: primary.failureTimes.length },
    fallback: { url: fallback.url, state: fallback.state, recentFailures: fallback.failureTimes.length },
  };
}
