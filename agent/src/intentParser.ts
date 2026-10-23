/**
 * Natural Language Intent Parser (#23)
 *
 * Converts free-form user messages into structured action objects.
 * Architecture:
 *  1. Try Claude / OpenAI via circuit breaker
 *  2. Validate LLM JSON output with Zod
 *  3. Fall back to rule-based regex parser if LLM is unavailable
 *  4. Log confidence scores; prompt confirmation for low-confidence intents
 *  5. Support multi-turn context (e.g. "do the same but with 200 USDC")
 *  6. Ask a clarifying question for genuinely ambiguous inputs
 *
 * #419: Parsing is separated from execution. `parseIntent` only extracts an
 * intent; it never enqueues or submits a transaction. Financial intents must
 * be turned into a bound `IntentConfirmation` (amount, asset, destination,
 * network) and explicitly confirmed before any execution occurs.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import logger from './logger';

// ─────────────────────────────────────────────────────────
// Types and schemas
// ─────────────────────────────────────────────────────────

export const ActionSchema = z.enum([
  'deposit',
  'withdraw',
  'withdraw_all',
  'check_balance',
  'check_earnings',
  'set_strategy',
  'get_apy',
  'clarify',
]);

export type Action = z.infer<typeof ActionSchema>;

export const StrategySchema = z.enum(['conservative', 'balanced', 'growth']);
export type Strategy = z.infer<typeof StrategySchema>;

export const ParsedIntentSchema = z.object({
  action: ActionSchema,
  /** Numeric amount for deposit/withdraw actions */
  amount: z.number().positive().optional(),
  /** "all" when user asks to withdraw everything */
  withdrawAll: z.boolean().optional(),
  /** Target investment strategy */
  strategy: StrategySchema.optional(),
  /** Clarifying question to ask the user (action === 'clarify') */
  clarifyingQuestion: z.string().optional(),
  /** Confidence score 0–1 from the LLM */
  confidence: z.number().min(0).max(1).default(1),
  /** Raw user input */
  raw: z.string(),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

/** Threshold below which we ask the user to confirm before executing */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────
// Explicit confirmation for financial intents (#419)
// ─────────────────────────────────────────────────────────

/** Actions that move funds and therefore require explicit confirmation. */
export const FINANCIAL_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'deposit',
  'withdraw',
  'withdraw_all',
]);

export function isFinancialAction(action: Action): boolean {
  return FINANCIAL_ACTIONS.has(action);
}

/**
 * Structured confirmation bound to a single financial operation.
 * Every field is explicit so the user can review amount, asset,
 * destination, and network before execution.
 */
export const IntentConfirmationSchema = z.object({
  /** Unique id of this confirmation; used to bind the authorized operation. */
  id: z.string(),
  /** The action this confirmation authorizes. */
  action: ActionSchema,
  /** Amount in the asset's base units (positive). */
  amount: z.number().positive(),
  /** Asset symbol, e.g. "USDC". */
  asset: z.string().min(1),
  /** Destination address (Stellar account / Soroban contract). */
  destination: z.string().min(1),
  /** Network identity, e.g. "testnet" | "mainnet". */
  network: z.string().min(1),
  /** Fingerprint of the parsed intent this confirmation was derived from. */
  intentFingerprint: z.string(),
  /** Creation time (ms since epoch). */
  createdAt: z.number(),
  /** Expiry time (ms since epoch); stale confirmations are rejected. */
  expiresAt: z.number(),
});

export type IntentConfirmation = z.infer<typeof IntentConfirmationSchema>;

/** How long a confirmation remains valid before it must be re-issued. */
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Stable fingerprint of the fields that define a financial operation.
 * Any edit to amount/asset/destination/network changes the fingerprint,
 * which invalidates previously issued confirmations.
 */
export function fingerprintIntent(
  intent: Pick<ParsedIntent, 'action' | 'amount' | 'withdrawAll'>,
  details: { asset: string; destination: string; network: string },
): string {
  return JSON.stringify({
    action: intent.action,
    amount: intent.amount ?? null,
    withdrawAll: intent.withdrawAll ?? false,
    asset: details.asset,
    destination: details.destination,
    network: details.network,
  });
}

/**
 * Build a structured confirmation for a financial intent.
 * Returns `null` when the intent is not financial or is missing required
 * fields (amount/asset/destination/network) — callers must NOT execute in
 * that case and should ask the user to clarify instead.
 */
export function buildConfirmation(
  intent: ParsedIntent,
  details: { asset?: string; destination?: string; network?: string },
  now: number = Date.now(),
): IntentConfirmation | null {
  if (!isFinancialAction(intent.action)) return null;
  if (intent.action !== 'withdraw_all' && typeof intent.amount !== 'number') return null;
  if (!details.asset || !details.destination || !details.network) return null;

  const fingerprint = fingerprintIntent(intent, {
    asset: details.asset,
    destination: details.destination,
    network: details.network,
  });

  return {
    id: `${intent.action}:${now}:${fingerprint}`,
    action: intent.action,
    amount: intent.amount ?? 0,
    asset: details.asset,
    destination: details.destination,
    network: details.network,
    intentFingerprint: fingerprint,
    createdAt: now,
    expiresAt: now + CONFIRMATION_TTL_MS,
  };
}

/**
 * Verify that a confirmation authorizes exactly the operation being executed.
 * Rejects expired confirmations and any confirmation whose bound fields no
 * longer match the current intent (edits invalidate old confirmations).
 */
export function verifyConfirmation(
  confirmation: IntentConfirmation,
  intent: ParsedIntent,
  details: { asset: string; destination: string; network: string },
  now: number = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (now > confirmation.expiresAt) {
    return { ok: false, reason: 'confirmation_expired' };
  }
  if (confirmation.action !== intent.action) {
    return { ok: false, reason: 'action_mismatch' };
  }
  const expected = fingerprintIntent(intent, details);
  if (confirmation.intentFingerprint !== expected) {
    return { ok: false, reason: 'intent_changed' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// Multi-turn context store (per-user conversation history)
// ─────────────────────────────────────────────────────────

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const conversationHistory = new Map<string, ConversationTurn[]>();

const MAX_HISTORY_TURNS = 6; // keep last 3 exchanges

export function getConversationHistory(userId: string): ConversationTurn[] {
  return conversationHistory.get(userId) ?? [];
}

export function appendToHistory(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
): void {
  const history = conversationHistory.get(userId) ?? [];
  history.push({ role, content });
  // Trim to the most recent MAX_HISTORY_TURNS turns
  if (history.length > MAX_HISTORY_TURNS) {
    history.splice(0, history.length - MAX_HISTORY_TURNS);
  }
  conversationHistory.set(userId, history);
}

export function clearHistory(userId: string): void {
  conversationHistory.delete(userId);
}

// ─────────────────────────────────────────────────────────
// Circuit breaker for LLM API calls
// ─────────────────────────────────────────────────────────

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreaker {
  state: BreakerState;
  failures: number;
  lastFailureTime: number;
  successCount: number;
}

const FAILURE_THRESHOLD = 3;
const RECOVERY_TIMEOUT_MS = 30_000; // 30 s before attempting half-open
const HALF_OPEN_SUCCESS_THRESHOLD = 2;

const breakers: Record<string, CircuitBreaker> = {
  anthropic: { state: 'CLOSED', failures: 0, lastFailureTime: 0, successCount: 0 },
  openai:    { state: 'CLOSED', failures: 0, lastFailureTime: 0, successCount: 0 },
};

function isAvailable(provider: string): boolean {
  const b = breakers[provider];
  if (!b) return true;
  if (b.state === 'CLOSED') return true;
  if (b.state === 'OPEN') {
    if (Date.now() - b.lastFailureTime >= RECOVERY_TIMEOUT_MS) {
      b.state = 'HALF_OPEN';
      b.successCount = 0;
      return true;
    }
    return false;
  }
  return true; // HALF_OPEN — allow one probe
}

function recordSuccess(provider: string): void {
  const b = breakers[provider];
  if (!b) return;
  if (b.state === 'HALF_OPEN') {
    b.successCount += 1;
    if (b.successCount >= HALF_OPEN_SUCCESS_THRESHOLD) {
      b.state = 'CLOSED';
      b.failures = 0;
    }
  } else {
    b.failures = 0;
  }
}

function recordFailure(provider: string): void {
  const b = breakers[provider];
  if (!b) return;
  b.failures += 1;
  b.lastFailureTime = Date.now();
  if (b.failures >= FAILURE_THRESHOLD || b.state === 'HALF_OPEN') {
    b.state = 'OPEN';
    logger.warn({ provider }, 'Circuit breaker opened for LLM provider');
  }
}

// ─────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an intent parser for the NeuroWealth DeFi investment bot.
Parse the user's message into a JSON object that EXACTLY matches this schema:

{
  "action": "deposit" | "withdraw" | "withdraw_all" | "check_balance" | "check_earnings" | "set_strategy" | "get_apy" | "clarify",
  "amount": <positive number, omit if not applicable>,
  "withdrawAll": <true only when user explicitly wants all funds withdrawn>,
  "strategy": "conservative" | "balanced" | "growth" (omit if not mentioned),
  "clarifyingQuestion": "<a question to ask the user when genuinely ambiguous, omit otherwise>",
  "confidence": <number 0.0–1.0 reflecting your certainty>
}

Rules:
- Output ONLY valid JSON — no markdown, no explanation.
- Use action "clarify" only when you truly cannot determine the intent.
- When the user says "all" or "everything" for a withdraw, set withdrawAll=true and omit amount.
- When the user references a prior action (e.g. "do it again" or "same but 200 USDC"), use the conversation context to fill in missing fields.
- confidence should be 1.0 for clear requests, lower for ambiguous ones.`;

// ─────────────────────────────────────────────────────────
// LLM helpers
// ─────────────────────────────────────────────────────────

async function callAnthropic(
  messages: ConversationTurn[],
  rawMessage: string,
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: rawMessage },
    ],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Anthropic response type');
  return block.text;
}

async function callOpenAI(
  messages: ConversationTurn[],
  rawMessage: string,
): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: rawMessage },
    ],
    max_tokens: 256,
    temperature: 0,
  });
  return completion.choices[0]?.message?.content ?? '';
}

// ─────────────────────────────────────────────────────────
// Rule-based fallback parser
// ─────────────────────────────────────────────────────────

/**
 * Fast regex fallback used when all LLM providers are unavailable.
 * Covers the most common intents with high recall.
 */
export function parseIntentWithRegex(message: string): ParsedIntent {
  const lower = message.toLowerCase().trim();

  // Withdraw all
  if (/\bwithdraw\s+(all|everything)\b/.test(lower)) {
    return { action: 'withdraw_all', withdrawAll: true, confidence: 0.95, raw: message };
  }

  // Withdraw <amount>
  const withdrawMatch = lower.match(/\bwithdraw\s+([\d,]+(?:\.\d+)?)/);
  if (withdrawMatch) {
    return {
      action: 'withdraw',
      amount: parseFloat(withdrawMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      raw: message,
    };
  }

  // Deposit <amount>
  const depositMatch = lower.match(/\bdeposit\s+([\d,]+(?:\.\d+)?)/);
  if (depositMatch) {
    return {
      action: 'deposit',
      amount: parseFloat(depositMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      raw: message,
    };
  }

  // Balance / earnings / apy / strategy
  if (/\b(balance|how much do i have)\b/.test(lower)) {
    return { action: 'check_balance', confidence: 0.9, raw: message };
  }
  if (/\b(earnings|yield|interest)\b/.test(lower)) {
    return { action: 'check_earnings', confidence: 0.85, raw: message };
  }
  if (/\b(apy|rate|return)\b/.test(lower)) {
    return { action: 'get_apy', confidence: 0.85, raw: message };
  }
  const strategyMatch = lower.match(/\b(conservative|balanced|growth)\b/);
  if (strategyMatch) {
    return {
      action: 'set_strategy',
      strategy: strategyMatch[1] as Strategy,
      confidence: 0.85,
      raw: message,
    };
  }

  // Genuinely ambiguous — ask for clarification, never execute
  return {
    action: 'clarify',
    clarifyingQuestion: 'Could you clarify what you would like to do?',
    confidence: 0.2,
    raw: message,
  };
}

// ─────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────

/**
 * Parse a user message into a structured intent.
 *
 * IMPORTANT (#419): this function only extracts intent. It never enqueues or
 * submits a transaction. Financial intents must be confirmed via
 * `buildConfirmation` + `verifyConfirmation` before execution.
 */
export async function parseIntent(
  userId: string,
  message: string,
): Promise<ParsedIntent> {
  const history = getConversationHistory(userId);

  for (const provider of ['anthropic', 'openai'] as const) {
    if (!isAvailable(provider)) continue;
    try {
      const raw =
        provider === 'anthropic'
          ? await callAnthropic(history, message)
          : await callOpenAI(history, message);
      const parsed = ParsedIntentSchema.parse({ ...JSON.parse(raw), raw: message });
      recordSuccess(provider);
      return parsed;
    } catch (err) {
      recordFailure(provider);
      logger.warn({ err, provider }, 'LLM intent parse failed, trying next provider');
    }
  }

  // All providers unavailable — fall back to regex
  return parseIntentWithRegex(message);
}
