/**
 * NeuroWealth Agent — Prometheus Metrics Endpoint
 *
 * Exposes /metrics in the Prometheus text format using the prom-client library.
 * Mount this module in the main agent Express app or run it as a standalone
 * sidecar on the configured port.
 *
 * Usage in agent/index.js (or index.ts):
 *   const { metricsRouter, recordRequest, recordRebalance, setQueueDepth,
 *           setVaultTvl, recordDeposit, recordWithdrawal } = require('./metrics');
 *   app.use(metricsRouter);
 *
 * Metrics exposed:
 *   - http_requests_total              (counter)
 *   - http_request_duration_seconds    (histogram: p50/p95/p99)
 *   - http_errors_total                (counter)
 *   - queue_depth                      (gauge)
 *   - rebalance_total                  (counter, labelled by protocol/status)
 *   - stellar_rpc_latency_seconds      (histogram: p50/p95/p99)
 *   - vault_tvl_usdc                   (gauge)
 *   - vault_deposit_total              (counter)
 *   - vault_withdrawal_total           (counter)
 *   - vault_total_shares               (gauge)
 *   - vault_share_price_usdc           (gauge)
 *   - agent_errors_total               (counter, labelled by type)
 *   - agent_decision_loop_duration_seconds (histogram)
 *
 * All prom-client default Node.js process metrics are also collected
 * (event loop lag, GC pauses, heap, file descriptors, etc.).
 */

'use strict';

const client = require('prom-client');
const express = require('express');

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new client.Registry();

// Attach default Node.js process metrics (CPU, memory, event loop lag, GC).
client.collectDefaultMetrics({ register: registry, prefix: 'neurowealth_agent_' });

// ---------------------------------------------------------------------------
// HTTP metrics
// ---------------------------------------------------------------------------

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received by the agent API',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds (p50/p95/p99)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP 4xx and 5xx responses',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Queue metrics (Bull / BullMQ)
// ---------------------------------------------------------------------------

const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Current number of jobs waiting in the Bull queue',
  labelNames: ['queue_name'],
  registers: [registry],
});

const queueCompletedTotal = new client.Counter({
  name: 'queue_completed_total',
  help: 'Total number of successfully completed queue jobs',
  labelNames: ['queue_name'],
  registers: [registry],
});

const queueFailedTotal = new client.Counter({
  name: 'queue_failed_total',
  help: 'Total number of failed queue jobs',
  labelNames: ['queue_name'],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Rebalance metrics
// ---------------------------------------------------------------------------

const rebalanceTotal = new client.Counter({
  name: 'rebalance_total',
  help: 'Total number of rebalance operations triggered by the agent',
  labelNames: ['protocol', 'status'],  // status: success | failed | partial | noop
  registers: [registry],
});

const rebalanceDurationSeconds = new client.Histogram({
  name: 'rebalance_duration_seconds',
  help: 'End-to-end time for a rebalance call (submit → confirmed)',
  labelNames: ['protocol'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Stellar RPC latency
// ---------------------------------------------------------------------------

const stellarRpcLatencySeconds = new client.Histogram({
  name: 'stellar_rpc_latency_seconds',
  help: 'Latency of Stellar Soroban RPC calls from the agent (p50/p95/p99)',
  labelNames: ['operation'],  // e.g., submitTransaction, getTransaction, getLedger
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

const stellarRpcErrorsTotal = new client.Counter({
  name: 'stellar_rpc_errors_total',
  help: 'Total number of Stellar RPC errors',
  labelNames: ['operation', 'error_type'],
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Vault on-chain metrics (polled from Stellar, updated by agent)
// ---------------------------------------------------------------------------

const vaultTvlUsdc = new client.Gauge({
  name: 'neurowealth_vault_total_assets',
  help: 'Vault total assets (TotalAssets) in USDC stroops as last read from chain',
  registers: [registry],
});

const vaultTotalShares = new client.Gauge({
  name: 'neurowealth_vault_total_shares',
  help: 'Total vault shares in circulation as last read from chain',
  registers: [registry],
});

const vaultSharePriceUsdc = new client.Gauge({
  name: 'neurowealth_vault_share_price_usdc',
  help: 'Current share price = TotalAssets / TotalShares (in USDC stroops)',
  registers: [registry],
});

const vaultDepositTotal = new client.Counter({
  name: 'neurowealth_vault_deposit_events_total',
  help: 'Total number of vault DepositEvents observed by the agent',
  registers: [registry],
});

const vaultWithdrawTotal = new client.Counter({
  name: 'neurowealth_vault_withdraw_events_total',
  help: 'Total number of vault WithdrawEvents observed by the agent',
  registers: [registry],
});

const vaultDepositAmountTotal = new client.Counter({
  name: 'neurowealth_vault_deposit_amount_total',
  help: 'Cumulative USDC deposited (stroops) as observed in DepositEvents',
  registers: [registry],
});

const vaultWithdrawAmountTotal = new client.Counter({
  name: 'neurowealth_vault_withdraw_amount_total',
  help: 'Cumulative USDC withdrawn (stroops) as observed in WithdrawEvents',
  registers: [registry],
});

// Track assets-updated decreases for the slow-bleed alert (docs/monitoring.md §8)
const vaultAssetsUpdatedDecreaseTotal = new client.Counter({
  name: 'neurowealth_vault_assets_updated_decrease_total',
  help: 'Count of AssetsUpdatedEvents where new_total < old_total',
  registers: [registry],
});

const vaultAssetsUpdatedDecreaseStroops = new client.Counter({
  name: 'neurowealth_vault_assets_updated_decrease_stroops_total',
  help: 'Cumulative USDC stroops decreased across all AssetsUpdatedEvents',
  registers: [registry],
});

const vaultIsPaused = new client.Gauge({
  name: 'neurowealth_vault_paused',
  help: '1 if the vault is currently paused, 0 if operating normally',
  registers: [registry],
});

const vaultConsecutiveFailures = new client.Gauge({
  name: 'neurowealth_vault_consecutive_failures',
  help: 'Current consecutive rebalance failure count (circuit breaker counter)',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Agent decision-loop metrics
// ---------------------------------------------------------------------------

const agentDecisionLoopDurationSeconds = new client.Histogram({
  name: 'agent_decision_loop_duration_seconds',
  help: 'Time taken to complete one full agent decision loop iteration',
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

const agentErrorsTotal = new client.Counter({
  name: 'agent_errors_total',
  help: 'Total errors encountered by the agent, labelled by type',
  labelNames: ['type'],  // rpc_error | contract_error | parse_error | queue_error
  registers: [registry],
});

const agentLastDecisionLoopTimestamp = new client.Gauge({
  name: 'agent_last_decision_loop_timestamp_seconds',
  help: 'Unix timestamp of the last completed agent decision loop (used for agent-down alert)',
  registers: [registry],
});

// ---------------------------------------------------------------------------
// Express router — exposes GET /metrics
// ---------------------------------------------------------------------------

const metricsRouter = express.Router();

/**
 * Middleware: record every request's method, route, status code, and duration.
 * Apply globally in the agent app: app.use(requestMetricsMiddleware)
 */
function requestMetricsMiddleware(req, res, next) {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode,
    };
    httpRequestsTotal.inc(labels);
    end(labels);
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });
  next();
}

/** GET /metrics — returns the full Prometheus text payload */
metricsRouter.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
});

// ---------------------------------------------------------------------------
// Helper functions for the agent to record observations
// ---------------------------------------------------------------------------

/**
 * Record a completed HTTP request (call from route handler or middleware).
 * @param {string} method
 * @param {string} route
 * @param {number} statusCode
 */
function recordRequest(method, route, statusCode) {
  httpRequestsTotal.inc({ method, route, status_code: statusCode });
}

/**
 * Record a completed rebalance operation.
 * @param {string} protocol  - 'blend' | 'dex' | 'none' | 'multi'
 * @param {string} status    - 'success' | 'failed' | 'partial' | 'noop'
 * @param {number} durationSec
 */
function recordRebalance(protocol, status, durationSec) {
  rebalanceTotal.inc({ protocol, status });
  rebalanceDurationSeconds.observe({ protocol }, durationSec);
}

/**
 * Set current Bull queue depth.
 * @param {string} queueName
 * @param {number} depth
 */
function setQueueDepth(queueName, depth) {
  queueDepth.set({ queue_name: queueName }, depth);
}

/** Increment completed-job counter for a queue. */
function recordQueueCompleted(queueName) {
  queueCompletedTotal.inc({ queue_name: queueName });
}

/** Increment failed-job counter for a queue. */
function recordQueueFailed(queueName) {
  queueFailedTotal.inc({ queue_name: queueName });
}

/**
 * Record a Stellar RPC call duration.
 * @param {string} operation  - e.g. 'submitTransaction'
 * @param {number} durationSec
 */
function recordRpcLatency(operation, durationSec) {
  stellarRpcLatencySeconds.observe({ operation }, durationSec);
}

/** Increment Stellar RPC error counter. */
function recordRpcError(operation, errorType) {
  stellarRpcErrorsTotal.inc({ operation, error_type: errorType });
}

/**
 * Update vault on-chain gauges.  Call after each ledger poll.
 * @param {{ totalAssets: bigint, totalShares: bigint, isPaused: boolean, consecutiveFailures: number }} snapshot
 */
function updateVaultSnapshot(snapshot) {
  vaultTvlUsdc.set(Number(snapshot.totalAssets));
  vaultTotalShares.set(Number(snapshot.totalShares));
  if (snapshot.totalShares > 0n) {
    vaultSharePriceUsdc.set(Number(snapshot.totalAssets) / Number(snapshot.totalShares));
  }
  vaultIsPaused.set(snapshot.isPaused ? 1 : 0);
  vaultConsecutiveFailures.set(snapshot.consecutiveFailures ?? 0);
}

/** Record a DepositEvent observed from the ledger stream. */
function recordDepositEvent(amountStroops) {
  vaultDepositTotal.inc();
  vaultDepositAmountTotal.inc(Number(amountStroops));
}

/** Record a WithdrawEvent observed from the ledger stream. */
function recordWithdrawEvent(amountStroops) {
  vaultWithdrawTotal.inc();
  vaultWithdrawAmountTotal.inc(Number(amountStroops));
}

/**
 * Record an AssetsUpdatedEvent.
 * @param {bigint} oldTotal
 * @param {bigint} newTotal
 */
function recordAssetsUpdatedEvent(oldTotal, newTotal) {
  if (newTotal < oldTotal) {
    vaultAssetsUpdatedDecreaseTotal.inc();
    vaultAssetsUpdatedDecreaseStroops.inc(Number(oldTotal - newTotal));
  }
}

/** Mark the current timestamp as the last completed decision loop. */
function recordDecisionLoopComplete(durationSec) {
  agentLastDecisionLoopTimestamp.set(Date.now() / 1000);
  agentDecisionLoopDurationSeconds.observe(durationSec);
}

/** Record an agent-level error. */
function recordAgentError(type) {
  agentErrorsTotal.inc({ type });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  registry,
  metricsRouter,
  requestMetricsMiddleware,
  // Helper functions
  recordRequest,
  recordRebalance,
  setQueueDepth,
  recordQueueCompleted,
  recordQueueFailed,
  recordRpcLatency,
  recordRpcError,
  updateVaultSnapshot,
  recordDepositEvent,
  recordWithdrawEvent,
  recordAssetsUpdatedEvent,
  recordDecisionLoopComplete,
  recordAgentError,
};
