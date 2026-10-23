import { pool } from './db';
import { evaluateYield } from './yieldComparison';
import { processEventForAlerts } from './alertEngine';
import logger from './logger';
import { withRetry } from './retry';
import { rpcCall, getRpcServer } from './rpcClient';
import {
  observeEventLedger,
  recordEventCheckpoint,
  recordEventProcessingFailure,
} from './operationalMetrics';

export { pool };

/** Convenience re-export for callers that still reference `server` directly. */
export const server = getRpcServer();

const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const EVENT_PAGE_LIMIT = 1000;

let eventInterval: ReturnType<typeof setInterval> | null = null;

export function stopEventListener() {
  if (eventInterval) {
    clearInterval(eventInterval);
    eventInterval = null;
    logger.info('Event listener stopped');
  }
}

/**
 * Listens for on-chain deposit and withdraw events from the vault contract.
 * Detects new deposits within 5 seconds and triggers yield deployment.
 */
export async function startEventListener() {
  if (!VAULT_CONTRACT_ID) {
    logger.warn('VAULT_CONTRACT_ID is not set. Event listener requires a contract ID to monitor.');
    return;
  }

  try {
    const latestLedgerResponse = await withRetry(
      () => rpcCall((s) => s.getLatestLedger()),
      'getLatestLedger',
    );
    let startLedger = latestLedgerResponse.sequence;
    observeEventLedger(startLedger);
    recordEventCheckpoint(startLedger, startLedger);
    logger.info({ startLedger }, 'Starting event listener');

    eventInterval = setInterval(async () => {
      try {
        const filters = [{ type: 'contract' as const, contractIds: [VAULT_CONTRACT_ID] }];
        const firstPage = await withRetry(
          () => rpcCall((s) => s.getEvents({
            startLedger,
            filters,
            pagination: { limit: EVENT_PAGE_LIMIT },
          })),
          'getEvents',
        );
        let latestLedger = firstPage.latestLedger;
        observeEventLedger(latestLedger);
        let page = firstPage;

        while (true) {
          for (const event of page.events) {
            const topics = event.topic.map(t => t.toString());
            let eventType = '';

            if (topics.some(t => t.includes('deposit'))) {
              eventType = 'deposit';
            } else if (topics.some(t => t.includes('withdraw'))) {
              eventType = 'withdraw';
            }

            if (!eventType) continue;

            logger.info({ eventType, ledger: event.ledger }, 'Detected event');

            await logEventToDb(eventType, event.id, event.ledger);

            if (eventType === 'deposit') {
              logger.info('New deposit detected, evaluating yield');
              const userStrategy = 'balanced';
              const currentProtocol = 'none';

              const decision = await evaluateYield(userStrategy, currentProtocol, 0);

              if (decision.shouldRebalance) {
                logger.info({ targetProtocol: decision.targetProtocol }, 'Rebalance needed');
              }
            }

            const alertPayload = { type: eventType, amount: 150000 };
            await processEventForAlerts(alertPayload);
          }

          if (page.events.length < EVENT_PAGE_LIMIT) break;
          const cursor = page.events[page.events.length - 1]?.cursor;
          if (!cursor) throw new Error('Full RPC event page returned no continuation cursor');
          page = await withRetry(
            () => rpcCall((s) => s.getEvents({
              filters,
              pagination: { cursor, limit: EVENT_PAGE_LIMIT },
            })),
            'getEvents page',
          );
          latestLedger = Math.max(latestLedger, page.latestLedger);
          observeEventLedger(latestLedger);
        }
        // The successful getEvents response covers the scanned range even when
        // the vault emitted no matching events in that range.
        startLedger = Math.max(startLedger, latestLedger + 1);
        recordEventCheckpoint(latestLedger, latestLedger);
      } catch (error) {
        recordEventProcessingFailure();
        logger.error({ error: error instanceof Error ? error.message : error }, 'Error polling Soroban events');
      }
    }, 5000);

  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Failed to initialize event listener');
  }
}

async function logEventToDb(type: string, eventId: string, ledger: number) {
  try {
    if (process.env.DATABASE_URL) {
      await pool.query(
        'INSERT INTO vault_events (event_id, event_type, ledger_sequence, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
        [eventId, type, ledger]
      );
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Database logging failed');
  }
}
