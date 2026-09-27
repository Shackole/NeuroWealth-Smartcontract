import 'dotenv/config';
import express from 'express';
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

// Initialize OpenTelemetry tracing
initializeTracing();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(express.json());
app.use(ipRateLimiter);
app.use(userRateLimiter);
app.use(healthRouter);

// Mount strategy aggregator API route (Issue #41)
app.use(strategyRouter);

let decisionInterval: ReturnType<typeof setInterval> | null = null;

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

  decisionInterval = setInterval(async () => {
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
  }, 60 * 60 * 1000);
}

async function main() {
  logger.info('Starting NeuroWealth AI Agent');

  configureHealthChecks(pool, server);
  await startEventListener();
  startDecisionLoop();

  // Issue #40: Start USDC issuer freeze monitor (polls every 10 minutes).
  issuerFreezeMonitor.start();

  const serverInstance = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Agent HTTP server listening');
  });

  // Graceful shutdown
  async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down`);

    if (decisionInterval) {
      clearInterval(decisionInterval);
      decisionInterval = null;
    }

    stopEventListener();

    // Issue #40: Stop freeze monitor cleanly.
    issuerFreezeMonitor.stop();

    serverInstance.close(() => {
      logger.info('HTTP server closed');
    });

    try {
      await pool.end();
      logger.info('Database pool closed');
    } catch {
      // ignore
    }

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ error: err.message }, 'Startup failed');
  process.exit(1);
});