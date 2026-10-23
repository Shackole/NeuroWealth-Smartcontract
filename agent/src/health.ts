/**
 * Agent health-check and self-monitoring endpoints — Issue #39.
 *
 * Endpoints:
 *   GET /health       — JSON summary of all dependency checks (DB, Redis,
 *                       Stellar RPC, last rebalance, queue depth).
 *   GET /health/ready — Kubernetes readiness probe: 503 if any critical
 *                       dependency is unreachable.
 *   GET /health/live  — Kubernetes liveness probe: 200 while the process
 *                       is alive.
 *
 * Alerting:
 *   If any critical check has failed for ALERT_WINDOW_MS (default 5 minutes)
 *   continuously, the alert handler is invoked once per window until it clears.
 */

import express from 'express';
import { Pool } from 'pg';
import { rpc as SorobanRpc } from '@stellar/stellar-sdk';
import { getPoolMetrics } from './db';
import { openAiKeyManager } from './openAiKeyManager';
import { lastRebalanceTimestamp, queueDepth } from './healthState';
import logger from './logger';

const router = express.Router();

// ── Dependency references set at startup ─────────────────────────────────────
let dbPool: Pool | null = null;
let rpcServer: SorobanRpc.Server | null = null;
/** Optional Redis-compatible client (ioredis or node-redis). */
let redisClient: { ping(): Promise<string> } | null = null;

const defaultRequiredDependencies = process.env.NODE_ENV === 'production'
  ? ['database', 'stellar_rpc']
  : [];
const requiredDependencies = new Set(
  (process.env.HEALTH_REQUIRED_DEPENDENCIES ?? defaultRequiredDependencies.join(','))
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean),
);

function dependencyIsHealthy(name: string, status: string): boolean {
  if (status === 'ok') return true;
  return status === 'not_configured' && !requiredDependencies.has(name);
}

// ── Alert state ───────────────────────────────────────────────────────────────
const ALERT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const criticalFailureSince: Record<string, number | null> = {};
const alertSent: Record<string, boolean> = {};

type AlertHandler = (check: string, message: string) => void;
let onAlert: AlertHandler | null = null;

function recordCheckResult(check: string, ok: boolean): void {
  if (ok) {
    criticalFailureSince[check] = null;
    alertSent[check] = false;
    return;
  }
  if (criticalFailureSince[check] == null) {
    criticalFailureSince[check] = Date.now();
  }
  const failingMs = Date.now() - (criticalFailureSince[check] ?? Date.now());
  if (failingMs >= ALERT_WINDOW_MS && !alertSent[check]) {
    alertSent[check] = true;
    const msg = `[NeuroWealth Agent] Critical check '${check}' has been failing for ≥5 minutes`;
    logger.error({ check, failingMs }, msg);
    onAlert?.(check, msg);
  }
}

// ── Configuration ─────────────────────────────────────────────────────────────

export interface HealthOptions {
  pool: Pool;
  rpcServer: SorobanRpc.Server;
  /** Optional Redis-compatible client. */
  redis?: { ping(): Promise<string> };
  /** Called when a critical check fails for 5+ consecutive minutes. */
  alertHandler?: AlertHandler;
}

export function configureHealthChecks(options: HealthOptions): void;
/** @deprecated Pass an options object instead. */
export function configureHealthChecks(pool: Pool, server: SorobanRpc.Server): void;
export function configureHealthChecks(
  poolOrOptions: Pool | HealthOptions,
  server?: SorobanRpc.Server,
): void {
  if (poolOrOptions instanceof Pool) {
    dbPool = poolOrOptions;
    rpcServer = server ?? null;
  } else {
    dbPool = poolOrOptions.pool;
    rpcServer = poolOrOptions.rpcServer;
    redisClient = poolOrOptions.redis ?? null;
    onAlert = poolOrOptions.alertHandler ?? null;
  }
}

// ── Individual check functions ────────────────────────────────────────────────

async function checkDatabase(): Promise<{ status: string; latencyMs?: number }> {
  if (!dbPool) return { status: 'not_configured' };
  const start = Date.now();
  try {
    await Promise.race([
      dbPool.query('SELECT 1'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB timeout')), 2_000),
      ),
    ]);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    logger.warn({ err }, 'DB health check failed');
    return { status: 'error' };
  }
}

async function checkRedis(): Promise<{ status: string; latencyMs?: number }> {
  if (!redisClient) return { status: 'not_configured' };
  const start = Date.now();
  try {
    const pong = await Promise.race([
      redisClient.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), 2_000),
      ),
    ]);
    if (typeof pong === 'string' && pong.toLowerCase().includes('pong')) {
      return { status: 'ok', latencyMs: Date.now() - start };
    }
    return { status: 'unexpected_response' };
  } catch (err) {
    logger.warn({ err }, 'Redis health check failed');
    return { status: 'error' };
  }
}

async function checkStellarRpc(): Promise<{
  status: string;
  latestLedger?: number;
  latencyMs?: number;
}> {
  if (!rpcServer) return { status: 'not_configured' };
  const start = Date.now();
  try {
    const ledger = await Promise.race([
      rpcServer.getLatestLedger(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout')), 5_000),
      ),
    ]);
    return {
      status: 'ok',
      latestLedger: ledger.sequence,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    logger.warn({ err }, 'Stellar RPC health check failed');
    return { status: 'error' };
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET /health
 *
 * Returns 200 when all configured checks pass, 503 otherwise.
 * Payload includes per-check status, latency, and operational metadata.
 */
router.get('/health', async (_req, res) => {
  const [dbResult, redisResult, rpcResult] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStellarRpc(),
  ]);

  const keyHealth = openAiKeyManager.getHealthStatus();
  const healthyKeysCount = keyHealth.filter((k) => k.isHealthy).length;
  const openAiStatus =
    keyHealth.length === 0
      ? 'not_configured'
      : healthyKeysCount > 0
        ? 'ok'
        : 'degraded';

  // Record alerts for critical checks
  recordCheckResult('database', dependencyIsHealthy('database', dbResult.status));
  recordCheckResult('stellar_rpc', dependencyIsHealthy('stellar_rpc', rpcResult.status));
  recordCheckResult('redis', dependencyIsHealthy('redis', redisResult.status));

  const checks = {
    database: dbResult.status,
    redis: redisResult.status,
    stellar_rpc: rpcResult.status,
    openai_api_keys: openAiStatus,
  };

  const isHealthy =
    dependencyIsHealthy('database', dbResult.status) &&
    dependencyIsHealthy('redis', redisResult.status) &&
    dependencyIsHealthy('stellar_rpc', rpcResult.status) &&
    (openAiStatus === 'ok' || openAiStatus === 'not_configured');

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    checks,
    latency: {
      database_ms: dbResult.latencyMs,
      redis_ms: redisResult.latencyMs,
      stellar_rpc_ms: rpcResult.latencyMs,
    },
    rebalance: {
      last_timestamp: lastRebalanceTimestamp,
      last_iso: lastRebalanceTimestamp
        ? new Date(lastRebalanceTimestamp).toISOString()
        : null,
      queue_depth: queueDepth,
    },
    stellar_rpc: {
      latest_ledger: (rpcResult as { latestLedger?: number }).latestLedger ?? null,
    },
    metrics: {
      dbPool: getPoolMetrics(),
      openAiKeys: {
        totalConfigured: openAiKeyManager.keyCount,
        healthyCount: healthyKeysCount,
      },
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/ready
 *
 * Kubernetes readiness probe.
 * Returns 503 when any configured dependency is down. In production, DB,
 * Redis, and Stellar RPC are required by default; local deployments may leave
 * optional dependencies unconfigured. Override the policy with
 * HEALTH_REQUIRED_DEPENDENCIES (comma-separated dependency names).
 */
router.get('/health/ready', async (_req, res) => {
  const [dbResult, redisResult, rpcResult] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStellarRpc(),
  ]);

  const databaseReady = dependencyIsHealthy('database', dbResult.status);
  const redisReady = dependencyIsHealthy('redis', redisResult.status);
  const stellarRpcReady = dependencyIsHealthy('stellar_rpc', rpcResult.status);
  const ready = databaseReady && redisReady && stellarRpcReady;

  res.status(ready ? 200 : 503).json({
    ready,
    checks: {
      database: dbResult.status,
      redis: redisResult.status,
      stellar_rpc: rpcResult.status,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 *
 * Kubernetes liveness probe.
 * Always returns 200 while the process is running. If this endpoint is
 * unreachable, the container orchestrator will restart the pod.
 */
router.get('/health/live', (_req, res) => {
  res.status(200).json({
    alive: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
