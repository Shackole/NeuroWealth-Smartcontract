import { scValToNative, xdr } from '@stellar/stellar-sdk';

export type VaultEventType = 'deposit' | 'withdraw';

export interface RpcVaultEvent {
  id?: unknown;
  ledger?: unknown;
  topic?: unknown;
}

export function chooseStartLedger(latestLedger: number, checkpoint?: number | null): number {
  return Number.isSafeInteger(checkpoint) && Number(checkpoint) > 0
    ? Number(checkpoint)
    : latestLedger;
}

export function eventRequestPosition(startLedger: number, cursor: string | null, limit: number) {
  return {
    ...(cursor ? {} : { startLedger }),
    pagination: { limit, ...(cursor ? { cursor } : {}) },
  };
}

export function parseVaultEvent(event: RpcVaultEvent): { eventType: VaultEventType; id: string; ledger: number } | null {
  if (typeof event.id !== 'string' || !event.id || !Number.isSafeInteger(event.ledger) || Number(event.ledger) < 1) return null;
  if (!Array.isArray(event.topic)) return null;
  let eventType: VaultEventType | null = null;
  try {
    const topics = event.topic.map((topic) => {
      if (typeof topic !== 'string') return topic.toString();
      try {
        return String(scValToNative(xdr.ScVal.fromXDR(topic, 'base64')));
      } catch {
        return topic;
      }
    });
    if (topics.some((topic) => topic.includes('deposit'))) eventType = 'deposit';
    else if (topics.some((topic) => topic.includes('withdraw'))) eventType = 'withdraw';
  } catch {
    return null;
  }
  return eventType ? { eventType, id: event.id, ledger: Number(event.ledger) } : null;
}

export function nextLedgerAfterWindow(startLedger: number, events: RpcVaultEvent[], latestLedger?: number): number {
  const eventLedger = events.reduce((latest, event) =>
    Number.isSafeInteger(event.ledger) ? Math.max(latest, Number(event.ledger)) : latest, startLedger - 1);
  const observedThrough = Number.isSafeInteger(latestLedger) && Number(latestLedger) >= startLedger
    ? Number(latestLedger)
    : eventLedger;
  return Math.max(startLedger, observedThrough + 1);
}

export function isHistoricalRangeUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /history.{0,30}(expired|unavailable|not found)|oldest ledger|start ledger.{0,30}(older|expired|available)|ledger.{0,20}(too old|expired)/i.test(message);
}

