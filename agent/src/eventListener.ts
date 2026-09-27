/**
 * Stellar Vault Event Listener (#26)
 *
 * Subscribes to Soroban contract events emitted by the NeuroWealth vault.
 * - Polls Stellar RPC getEvents every 5 seconds
 * - Stores last_processed_ledger in Redis for restart recovery
 * - On startup, catches up from the last processed ledger (no missed events)
 * - Reconnects automatically after connection drops with exponential back-off
 * - Handles: Deposited, Withdrawn, Rebalanced, Harvested, Paused, Unpaused,
 *   UpgradeScheduled events
 */

import { SorobanRpc } from '@stellar/stellar-sdk';
import { pool } from './db';
import { evaluateYield } from './yieldComparison';
import { processEventForAlerts } from './alertEngine';
import logger from './logger';
import { withRetry } from './retry';
import { createClient, RedisClientType } from 'redis';

// ─────────────────────────────────────────────────────────
// Constants — mirror topics.rs symbol_short! values
// ─────────────────────────────────────────────────────────
export const EVENT_TOPICS = {
  DEPOSIT: 'deposit',
  WITHDRAW: 'withdraw',
  REBALANCE: 'rebalance',
  HARVEST: 'harvest',
  PAUSED: 'paused',
  UNPAUSED: 'unpaused',
  UPGRADE_SCHEDULED: 'upg_sched',
  EMERGENCY_PAUSED: 'emerg',
  REBALANCE_FAILED: 'reb_fail',
  COMPOUND: 'compound',
} as const;

export type VaultEventType = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];

export interface VaultEvent {
  id: string;
  type: VaultEventType;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  topics: string[];
  value: unknown;
}

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────
const RPC_URL =
  process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const VAULT_CONTRACT_ID = process.env.VAULT_CONTRACT_ID || '';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const POLL_INTERVAL_MS = 5_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const LEDGER_REDIS_KEY = 'neurowealth:last_processed_ledger';

export const server = new SorobanRpc.Server(RPC_URL);

let eventInterval: ReturnType<typeof setInterval> | null = null;
let redisClient: RedisClientType | null = null;
let reconnectAttempts = 0;

// ─────────────────────────────────────────────────────────
// Redis helpers
// ─────────────────────────────────────────────────────────

async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisClient && redisClient.isOpen) return redisClient;
  try {
    const client = createClient({ url: REDIS_URL }) as RedisClientType;
    client.on('error', (err) =>
      logger.warn({ err: err.message }, 'Redis client error'),
    );
    await client.connect();
    redisClient = client;
    logger.info('Redis connected');
    return client;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'Redis unavailable — ledger cursor will use in-memory fallback',
    );
    return null;
  }
}

async function saveLastProcessedLedger(ledger: number): Promise<void> {
  const client = await getRedisClient();
  if (client) {
    await client.set(LEDGER_REDIS_KEY, ledger.toString());
  }
}

async function loadLastProcessedLedger(): Promise<number | null> {
  const client = await getRedisClient();
  if (!client) return null;
  const stored = await client.get(LEDGER_REDIS_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

export function stopEventListener(): void {
  if (eventInterval) {
    clearInterval(eventInterval);
    eventInterval = null;
    logger.info('Event listener stopped');
  }
}

/**
 * Start listening for vault contract events.
 *
 * On startup, resumes from the last processed ledger stored in Redis so no
 * events are missed across restarts.  If Redis is unavailable the listener
 * falls back to the latest ledger (events during downtime will be missed but
 * the service will not crash).
 */
export async function startEventListener(): Promise<void> {
  if (!VAULT_CONTRACT_ID) {
    logger.warn(
      'VAULT_CONTRACT_ID is not set — event listener will not start.',
    );
    return;
  }

  try {
    // ── 1. Determine starting ledger ──────────────────────────────────────
    const latestLedgerResponse = await withRetry(
      () => server.getLatestLedger(),
      'getLatestLedger',
    );
    const latestLedger = latestLedgerResponse.sequence;

    const savedLedger = await loadLastProcessedLedger();
    let startLedger = savedLedger !== null ? savedLedger : latestLedger;

    if (savedLedger !== null) {
      logger.info(
        { savedLedger, latestLedger },
        'Resuming from last processed ledger — catching up on missed events',
      );
    } else {
      logger.info({ startLedger }, 'No saved ledger found — starting from latest');
    }

    reconnectAttempts = 0;

    // ── 2. Polling loop ────────────────────────────────────────────────────
    eventInterval = setInterval(async () => {
      try {
        const response = await withRetry(
          () =>
            server.getEvents({
              startLedger,
              filters: [
                {
                  type: 'contract',
                  contractIds: [VAULT_CONTRACT_ID],
                },
              ],
              limit: 100,
            }),
          'getEvents',
        );

        for (const raw of response.events) {
          const eventType = classifyEvent(raw.topic.map((t) => t.toString()));
          if (!eventType) continue;

          const event: VaultEvent = {
            id: raw.id,
            type: eventType,
            ledger: raw.ledger,
            ledgerClosedAt: raw.ledgerClosedAt,
            contractId: raw.contractId.toString(),
            topics: raw.topic.map((t) => t.toString()),
            value: raw.value,
          };

          logger.info(
            { eventType, ledger: event.ledger, eventId: event.id },
            'Vault event detected',
          );

          await handleVaultEvent(event);
          await persistEvent(event);

          startLedger = Math.max(startLedger, event.ledger + 1);
          await saveLastProcessedLedger(startLedger);
        }

        // Reset reconnect counter on successful poll
        reconnectAttempts = 0;
      } catch (err) {
        reconnectAttempts += 1;
        const backoffMs = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1),
          RECONNECT_MAX_MS,
        );
        logger.error(
          {
            err: err instanceof Error ? err.message : err,
            attempt: reconnectAttempts,
            backoffMs,
          },
          'Error polling Soroban events — will retry',
        );
        // Brief delay on the next interval tick is handled naturally by
        // setInterval; no extra sleep required.
      }
    }, POLL_INTERVAL_MS);

    logger.info({ startLedger, pollIntervalMs: POLL_INTERVAL_MS }, 'Event listener started');
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err },
      'Failed to initialise event listener',
    );
    // Exponential back-off before re-attempting full initialisation
    const backoffMs = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    reconnectAttempts += 1;
    logger.info({ backoffMs }, 'Scheduling event listener restart');
    setTimeout(() => startEventListener(), backoffMs);
  }
}

// ─────────────────────────────────────────────────────────
// Event classification
// ─────────────────────────────────────────────────────────

/**
 * Returns the canonical VaultEventType for a set of raw Soroban topic strings,
 * or `null` if the event is not one we care about.
 */
function classifyEvent(topics: string[]): VaultEventType | null {
  for (const topic of topics) {
    if (topic.includes(EVENT_TOPICS.DEPOSIT)) return EVENT_TOPICS.DEPOSIT;
    if (topic.includes(EVENT_TOPICS.WITHDRAW)) return EVENT_TOPICS.WITHDRAW;
    if (topic.includes(EVENT_TOPICS.REBALANCE) && !topic.includes('fail') && !topic.includes('cd'))
      return EVENT_TOPICS.REBALANCE;
    if (topic.includes(EVENT_TOPICS.HARVEST)) return EVENT_TOPICS.HARVEST;
    if (topic.includes(EVENT_TOPICS.UPGRADE_SCHEDULED)) return EVENT_TOPICS.UPGRADE_SCHEDULED;
    if (topic.includes(EVENT_TOPICS.EMERGENCY_PAUSED)) return EVENT_TOPICS.EMERGENCY_PAUSED;
    if (topic.includes(EVENT_TOPICS.UNPAUSED)) return EVENT_TOPICS.UNPAUSED;
    if (topic.includes(EVENT_TOPICS.PAUSED)) return EVENT_TOPICS.PAUSED;
    if (topic.includes(EVENT_TOPICS.REBALANCE_FAILED)) return EVENT_TOPICS.REBALANCE_FAILED;
    if (topic.includes(EVENT_TOPICS.COMPOUND)) return EVENT_TOPICS.COMPOUND;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// Domain event handlers
// ─────────────────────────────────────────────────────────

async function handleVaultEvent(event: VaultEvent): Promise<void> {
  switch (event.type) {
    case EVENT_TOPICS.DEPOSIT:
      await handleDeposit(event);
      break;
    case EVENT_TOPICS.WITHDRAW:
      await handleWithdraw(event);
      break;
    case EVENT_TOPICS.REBALANCE:
      await handleRebalance(event);
      break;
    case EVENT_TOPICS.HARVEST:
      await handleHarvest(event);
      break;
    case EVENT_TOPICS.PAUSED:
    case EVENT_TOPICS.EMERGENCY_PAUSED:
      await handlePaused(event);
      break;
    case EVENT_TOPICS.UNPAUSED:
      await handleUnpaused(event);
      break;
    case EVENT_TOPICS.UPGRADE_SCHEDULED:
      await handleUpgradeScheduled(event);
      break;
    case EVENT_TOPICS.REBALANCE_FAILED:
      await handleRebalanceFailed(event);
      break;
    default:
      logger.debug({ eventType: event.type }, 'Unhandled vault event type — skipping');
  }

  // Forward every event to the alert engine
  await processEventForAlerts({ type: event.type, ledger: event.ledger, raw: event });
}

/**
 * Deposited: update DB user balance + trigger AI allocation decision.
 */
async function handleDeposit(event: VaultEvent): Promise<void> {
  const payload = event.value as {
    user?: string;
    amount?: number;
    shares?: number;
  } | null;

  logger.info(
    { ledger: event.ledger, user: payload?.user, amount: payload?.amount },
    'Processing Deposited event',
  );

  // Update persisted user balance
  if (payload?.user && payload?.amount !== undefined) {
    await upsertUserBalance(payload.user, payload.amount, 'deposit');
  }

  // Trigger AI allocation decision
  logger.info('New deposit detected — evaluating yield allocation');
  const decision = await evaluateYield('balanced', 'none', 0);
  if (decision.shouldRebalance) {
    logger.info(
      { targetProtocol: decision.targetProtocol, expectedApy: decision.expectedApy },
      'AI allocation decision: rebalance required',
    );
  } else {
    logger.info('AI allocation decision: no rebalance needed');
  }
}

/**
 * Withdrawn: update DB user balance.
 */
async function handleWithdraw(event: VaultEvent): Promise<void> {
  const payload = event.value as {
    user?: string;
    amount?: number;
    shares?: number;
  } | null;

  logger.info(
    { ledger: event.ledger, user: payload?.user, amount: payload?.amount },
    'Processing Withdrawn event',
  );

  if (payload?.user && payload?.amount !== undefined) {
    await upsertUserBalance(payload.user, -payload.amount, 'withdraw');
  }
}

/**
 * Rebalanced: log new protocol, APY, and timestamp to DB.
 */
async function handleRebalance(event: VaultEvent): Promise<void> {
  const payload = event.value as {
    new_protocol?: string;
    expected_apy?: number;
    old_protocol?: string;
  } | null;

  logger.info(
    {
      ledger: event.ledger,
      newProtocol: payload?.new_protocol,
      expectedApy: payload?.expected_apy,
    },
    'Processing Rebalanced event',
  );

  await logRebalanceToDb(
    event.ledger,
    event.ledgerClosedAt,
    payload?.new_protocol ?? 'unknown',
    payload?.expected_apy ?? 0,
    payload?.old_protocol ?? 'unknown',
  );
}

/**
 * Harvested: log yield harvest to DB.
 */
async function handleHarvest(event: VaultEvent): Promise<void> {
  const payload = event.value as {
    yield_amount?: number;
    protocol?: string;
  } | null;

  logger.info(
    { ledger: event.ledger, yieldAmount: payload?.yield_amount, protocol: payload?.protocol },
    'Processing Harvested event',
  );

  await logHarvestToDb(
    event.ledger,
    event.ledgerClosedAt,
    payload?.protocol ?? 'unknown',
    payload?.yield_amount ?? 0,
  );
}

/**
 * Paused / EmergencyPaused: log alert.
 */
async function handlePaused(event: VaultEvent): Promise<void> {
  logger.warn({ ledger: event.ledger, type: event.type }, 'Vault PAUSED event received');
  await updateVaultStatusInDb('paused', event.ledgerClosedAt);
}

/**
 * Unpaused: restore normal status.
 */
async function handleUnpaused(event: VaultEvent): Promise<void> {
  logger.info({ ledger: event.ledger }, 'Vault UNPAUSED event received');
  await updateVaultStatusInDb('active', event.ledgerClosedAt);
}

/**
 * UpgradeScheduled: log the pending upgrade for monitoring.
 */
async function handleUpgradeScheduled(event: VaultEvent): Promise<void> {
  const payload = event.value as {
    new_wasm_hash?: string;
    effective_ledger?: number;
  } | null;

  logger.warn(
    {
      ledger: event.ledger,
      newWasmHash: payload?.new_wasm_hash,
      effectiveLedger: payload?.effective_ledger,
    },
    'UpgradeScheduled event — upgrade pending review',
  );

  await logUpgradeScheduledToDb(
    event.ledger,
    event.ledgerClosedAt,
    payload?.new_wasm_hash ?? '',
    payload?.effective_ledger ?? 0,
  );
}

/**
 * RebalanceFailed: alert on rebalance abort.
 */
async function handleRebalanceFailed(event: VaultEvent): Promise<void> {
  logger.error({ ledger: event.ledger }, 'RebalanceFailed event — rebalance aborted');
  await logRebalanceFailedToDb(event.ledger, event.ledgerClosedAt, event.value);
}

// ─────────────────────────────────────────────────────────
// Database helpers
// ─────────────────────────────────────────────────────────

async function persistEvent(event: VaultEvent): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO vault_events (event_id, event_type, ledger_sequence, ledger_closed_at, contract_id, topics, value, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.id,
        event.type,
        event.ledger,
        event.ledgerClosedAt,
        event.contractId,
        JSON.stringify(event.topics),
        JSON.stringify(event.value),
      ],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to persist vault event to DB');
  }
}

async function upsertUserBalance(
  userAddress: string,
  delta: number,
  direction: 'deposit' | 'withdraw',
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO user_balances (stellar_address, balance_usdc, last_updated)
       VALUES ($1, GREATEST(0, $2), NOW())
       ON CONFLICT (stellar_address)
       DO UPDATE SET
         balance_usdc = GREATEST(0, user_balances.balance_usdc + $2),
         last_updated = NOW()`,
      [userAddress, direction === 'deposit' ? delta : -Math.abs(delta)],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to update user balance in DB');
  }
}

async function logRebalanceToDb(
  ledger: number,
  closedAt: string,
  protocol: string,
  apy: number,
  oldProtocol: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO rebalance_logs (ledger_sequence, ledger_closed_at, new_protocol, old_protocol, expected_apy, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [ledger, closedAt, protocol, oldProtocol, apy],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to log rebalance to DB');
  }
}

async function logHarvestToDb(
  ledger: number,
  closedAt: string,
  protocol: string,
  yieldAmount: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO harvest_logs (ledger_sequence, ledger_closed_at, protocol, yield_amount, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [ledger, closedAt, protocol, yieldAmount],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to log harvest to DB');
  }
}

async function updateVaultStatusInDb(
  status: 'active' | 'paused',
  updatedAt: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO vault_status (id, status, updated_at)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET status = $1, updated_at = $2`,
      [status, updatedAt],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to update vault status in DB');
  }
}

async function logUpgradeScheduledToDb(
  ledger: number,
  closedAt: string,
  wasmHash: string,
  effectiveLedger: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO upgrade_schedule_logs (ledger_sequence, ledger_closed_at, new_wasm_hash, effective_ledger, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [ledger, closedAt, wasmHash, effectiveLedger],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to log upgrade schedule to DB');
  }
}

async function logRebalanceFailedToDb(
  ledger: number,
  closedAt: string,
  value: unknown,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      `INSERT INTO rebalance_failed_logs (ledger_sequence, ledger_closed_at, payload, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [ledger, closedAt, JSON.stringify(value)],
    );
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to log rebalance failure to DB');
  }
}
