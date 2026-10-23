/**
 * Resilient Stellar RPC client with circuit breaker and latency tracking (Issue #122).
 *
 * Supports a primary endpoint and an optional same-network fallback for
 * explicitly opted-in idempotent reads. After 3 primary failures in a
 * 60-second window the circuit opens; after 30 seconds it permits a probe.
 *
 * RPC latency is tracked via the existing MetricsEngine pattern and emitted as
 * structured log fields so the Prometheus scraper in infra/metrics/metrics.js
 * can pick them up through the `stellar_rpc_latency_seconds` histogram already
 * defined there.
 *
 * Configuration via environment variables:
 *   SOROBAN_RPC_URL          Primary endpoint   (default: Stellar public testnet)
 *   SOROBAN_RPC_URL_FALLBACK Explicit fallback endpoint on the same network
 *   SOROBAN_NETWORK_PASSPHRASE Expected network identity, required with fallback
 */

import { rpc as SorobanRpc } from '@stellar/stellar-sdk';
import logger from './logger';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRIMARY_RPC_URL =
  process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const FALLBACK_RPC_URL = process.env.SOROBAN_RPC_URL_FALLBACK;
const EXPECTED_NETWORK_PASSPHRASE = process.env.SOROBAN_NETWORK_PASSPHRASE;

if (FALLBACK_RPC_URL && !EXPECTED_NETWORK_PASSPHRASE) {
  throw new Error('SOROBAN_NETWORK_PASSPHRASE is required when an RPC fallback is configured');
}

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
  networkVerifiedAt: number;
}

function makeEndpoint(url: string): EndpointState {
  return {
    url,
    server: new SorobanRpc.Server(url),
    state: 'closed',
    failureTimes: [],
    openedAt: null,
    networkVerifiedAt: 0,
  };
}

const primary: EndpointState = makeEndpoint(PRIMARY_RPC_URL);
const fallback: EndpointState | null = FALLBACK_RPC_URL
  ? makeEndpoint(FALLBACK_RPC_URL)
  : null;

const NETWORK_VERIFICATION_TTL_MS = 5 * 60_000;

function safeEndpointLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '<configured RPC endpoint>';
  }
}

async function verifyNetwork(ep: EndpointState): Promise<void> {
  if (!EXPECTED_NETWORK_PASSPHRASE) return;
  if (Date.now() - ep.networkVerifiedAt < NETWORK_VERIFICATION_TTL_MS) return;

  const network = await ep.server.getNetwork();
  if (network.passphrase !== EXPECTED_NETWORK_PASSPHRASE) {
    ep.networkVerifiedAt = 0;
    throw new Error(`RPC network mismatch for ${safeEndpointLabel(ep.url)}; refusing to use a different Stellar network`);
  }
  ep.networkVerifiedAt = Date.now();
}

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
    logger.info({ rpcUrl: safeEndpointLabel(ep.url), previousState: ep.state }, 'RPC circuit closed — endpoint recovered');
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
        rpcUrl: safeEndpointLabel(ep.url),
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
      logger.info({ rpcUrl: safeEndpointLabel(ep.url), elapsedMs: elapsed }, 'RPC circuit half-open — probing primary');
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
    await verifyNetwork(ep);
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

/** Returns the primary server. Fallback is only available through rpcCall. */
export function getActiveEndpoint(): { server: SorobanRpc.Server; endpoint: string } {
  pruneOldFailures(primary);
  return { server: primary.server, endpoint: primary.url };
}

/**
 * Executes `fn` against the primary endpoint and tracks its health. Retrying
 * against an explicitly configured fallback is opt-in for idempotent reads;
 * transaction submission must not be retried after an ambiguous timeout.
 */
export async function rpcCall<T>(
  fn: (server: SorobanRpc.Server) => Promise<T>,
  options: { retryOnFallback?: boolean } = {},
): Promise<T> {
  pruneOldFailures(primary);

  if (isAvailable(primary)) {
    try {
      return await timedCall(primary, fn);
    } catch (err) {
      // A timeout may have left a submission's status uncertain. Retrying is
      // opt-in and reserved for idempotent reads only.
      if (!fallback || !options.retryOnFallback) throw err;
      logger.warn(
        { error: err instanceof Error ? err.message : String(err), fallbackUrl: safeEndpointLabel(fallback.url) },
        'Primary RPC call failed — retrying on the network-verified fallback',
      );
    }
  }

  // Fallback attempt
  if (!fallback || !options.retryOnFallback) {
    throw new Error('Primary RPC circuit is unavailable; automatic failover is disabled for this call');
  }
  return timedCall(fallback, fn);
}

/**
 * Convenience: returns the active SorobanRpc.Server (primary or fallback).
 * Callers that need a bare Server object (e.g. eventListener) can use this.
 */
export function getRpcServer(): SorobanRpc.Server {
  // Legacy callers receive primary only; all failover must pass through
  // rpcCall so network verification and read-only retry policy are enforced.
  return primary.server;
}

/** Exposes internal circuit state for health endpoints. */
export function getRpcCircuitStatus(): {
  primary: { url: string; state: CircuitState; recentFailures: number };
  fallback: { url: string; state: CircuitState; recentFailures: number } | null;
} {
  pruneOldFailures(primary);
  if (fallback) pruneOldFailures(fallback);
  return {
    primary: { url: safeEndpointLabel(primary.url), state: primary.state, recentFailures: primary.failureTimes.length },
    fallback: fallback ? { url: safeEndpointLabel(fallback.url), state: fallback.state, recentFailures: fallback.failureTimes.length } : null,
  };
}
