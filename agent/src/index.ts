import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { startEventListener, stopEventListener, server, pool } from './eventListener';
import { evaluateYield } from './yieldComparison';
import healthRouter, { configureHealthChecks } from './health';
import logger from './logger';
import { initializeTracing } from './tracing';

import { ipRateLimiter, userRateLimiter } from './rateLimiter';

// Issue #40: USDC issuer freeze contingency monitor
import { issuerFreezeMonitor } from './issuerFreezeMonitor';

// Issue #41: Strategy preference aggregator
import {
  strategyRouter,
  aggregateStrategyPreferences,
  setLatestDistribution,
  createDefaultRpcAdapter,
} from './strategyAggregator';
import { BackgroundWork } from './backgroundWork';
import { closeRedisClients } from './redisClients';

// Initialize OpenTelemetry tracing
initializeTracing();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const MAX_SHUTDOWN_TIMEOUT_MS = 25_000;
const configuredShutdownTimeout = process.env.SHUTDOWN_TIMEOUT_MS;
const parsedShutdownTimeout = Number(configuredShutdownTimeout);
const SHUTDOWN_TIMEOUT_MS = !configuredShutdownTimeout
  ? MAX_SHUTDOWN_TIMEOUT_MS
  : Number.isSafeInteger(parsedShutdownTimeout) && parsedShutdownTimeout > 0
    ? Math.min(parsedShutdownTimeout, MAX_SHUTDOWN_TIMEOUT_MS)
    : MAX_SHUTDOWN_TIMEOUT_MS;
if (
  configuredShutdownTimeout
  && (!Number.isSafeInteger(parsedShutdownTimeout)
    || parsedShutdownTimeout <= 0
    || parsedShutdownTimeout > MAX_SHUTDOWN_TIMEOUT_MS)
) {
  logger.warn(
    { value: configuredShutdownTimeout, effectiveTimeoutMs: SHUTDOWN_TIMEOUT_MS },
    'Invalid or excessive SHUTDOWN_TIMEOUT_MS; using bounded value',
  );
}
const backgroundWork = new BackgroundWork();
let shuttingDown = false;
let serverInstance: Server | null = null;
let shutdownPromise: Promise<void> | null = null;

app.use((_req, res, next) => {
  if (shuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({ error: 'Agent is shutting down' });
    return;
  }
  next();
});
app.use(express.json());
app.use(ipRateLimiter);
app.use(userRateLimiter);
app.use(healthRouter);

// Mount strategy aggregator API route (Issue #41)
app.use(strategyRouter);

let decisionInterval: ReturnType<typeof setInterval> | null = null;
let decisionRunning = false;

/**
 * Invokes the vault contract's `auto_compound(min_out)` function to harvest
 * accrued yield and immediately reinvest it in the same protocol, maximizing
 * compound growth without user intervention.
 *
 * @param minOut - Minimum amount of yield that must be compounded; reverts if
 *                 the available yield is below this threshold.
 */
async function autoCompound(minOut: number = 0): Promise<void> {
  const vaultAddress = process.env.VAULT_ADDRESS;
  if (!vaultAddress) {
    throw new Error("VAULT_ADDRESS environment variable is not set");
  }

  console.log(`Auto-compounding yield on vault ${vaultAddress} with min_out=${minOut}`);

  // TODO: Replace with a real Soroban contract invocation, e.g.:
  // const vault = new Contract(vaultAddress);
  // await vault.call('auto_compound', minOut);
  // This is intentionally left as a placeholder because the RPC client
  // configuration is environment-specific.
}

function startDecisionLoop() {
  logger.info('Initializing hourly decision loop');

  decisionInterval = setInterval(() => {
    if (decisionRunning) return;
    decisionRunning = true;
    const task = backgroundWork.run(async () => {
      try {
        logger.info('Running hourly yield evaluation');

        // Issue #41: Aggregate per-user strategy preferences and update cache.
        const rpc = createDefaultRpcAdapter();
        const distribution = await aggregateStrategyPreferences(rpc);
        setLatestDistribution(distribution);
        logger.info(
          {
            aggregateBlendBps: distribution.aggregateBlendBps,
            aggregateDexBps: distribution.aggregateDexBps,
            totalUsers: distribution.total,
          },
          'Strategy distribution updated',
        );

        const decision = await evaluateYield('balanced', 'blend', 6.5);

        if (decision.shouldRebalance) {
          logger.info({ targetProtocol: decision.targetProtocol }, 'Rebalance needed');
        } else {
          console.log(`Hourly check: Yield is optimal. No action needed.`);
          // Yield is already in the best protocol; compound it for maximum growth
          await autoCompound(0);
        }
      } catch (error) {
        logger.error({ error: error instanceof Error ? error.message : error }, 'Decision loop error');
      }
    });
    if (!task) {
      decisionRunning = false;
      return;
    }
    void task.then(
      () => {
        decisionRunning = false;
      },
      (error) => {
        decisionRunning = false;
        logger.error({ error: error instanceof Error ? error.message : error }, 'Decision loop task failed');
      },
    );
  }, 60 * 60 * 1000);
}

async function main() {
  logger.info('Starting NeuroWealth AI Agent');

  configureHealthChecks(pool, server);
  await startEventListener(backgroundWork);
  if (shuttingDown) return;
  startDecisionLoop();

  // Issue #40: Start USDC issuer freeze monitor (polls every 10 minutes).
  issuerFreezeMonitor.start(backgroundWork);

  serverInstance = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Agent HTTP server listening');
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  backgroundWork.stopAccepting();
  logger.info({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Shutdown started');

  if (decisionInterval) {
    clearInterval(decisionInterval);
    decisionInterval = null;
  }

  stopEventListener();

  // Issue #40: Stop freeze monitor cleanly.
  issuerFreezeMonitor.stop();

  const httpServer = serverInstance;
  const serverClosed = httpServer
    ? new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        httpServer.closeIdleConnections();
      })
    : Promise.resolve();

  const forceExit = setTimeout(() => {
    logger.fatal({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Shutdown deadline exceeded; forcing process exit');
    serverInstance?.closeAllConnections();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  shutdownPromise = (async () => {
    let shutdownFailed = false;
    try {
      const drained = await backgroundWork.drain(SHUTDOWN_TIMEOUT_MS);
      if (!drained) {
        shutdownFailed = true;
        logger.error(
          { timeoutMs: SHUTDOWN_TIMEOUT_MS, activeTasks: backgroundWork.activeCount },
          'Background work did not drain before the shutdown deadline',
        );
      }
    } catch (error) {
      shutdownFailed = true;
      logger.error(
        { error: error instanceof Error ? error.message : error },
        'Failed while draining background work',
      );
    }

    try {
      await serverClosed;
      logger.info('HTTP server closed');
    } catch (error) {
      shutdownFailed = true;
      logger.error(
        { error: error instanceof Error ? error.message : error },
        'Failed to close HTTP server',
      );
    }

    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch (error) {
      shutdownFailed = true;
      logger.error(
        { error: error instanceof Error ? error.message : error },
        'Failed to close database pool',
      );
    }

    try {
      await closeRedisClients();
      logger.info('Redis clients closed');
    } catch (error) {
      shutdownFailed = true;
      logger.error(
        { error: error instanceof Error ? error.message : error },
        'Failed to close Redis clients',
      );
    }

    if (shutdownFailed) {
      process.exitCode = 1;
      clearTimeout(forceExit);
      process.exit(1);
    } else {
      process.exitCode = 0;
      clearTimeout(forceExit);
      process.exit(0);
    }
  })();
  return shutdownPromise;
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

main().catch((err) => {
  logger.fatal({ error: err.message }, 'Startup failed');
  process.exit(1);
});