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
    const stratMatch = lower.match(/\b(conservative|balanced|growth)\b/);
    return {
      action: 'deposit',
      amount: parseFloat(depositMatch[1].replace(/,/g, '')),
      strategy: stratMatch ? (stratMatch[1] as Strategy) : undefined,
      confidence: 0.9,
      raw: message,
    };
  }

  // Balance
  if (/\b(balance|how much|my portfolio|portfolio)\b/.test(lower)) {
    return { action: 'check_balance', confidence: 0.9, raw: message };
  }

  // Earnings
  if (/\b(earn|earnings|yield|profit|made)\b/.test(lower)) {
    return { action: 'check_earnings', confidence: 0.85, raw: message };
  }

  // APY
  if (/\b(apy|interest|rate|annual)\b/.test(lower)) {
    return { action: 'get_apy', confidence: 0.85, raw: message };
  }

  // Strategy switch
  const stratMatch = lower.match(
    /\b(?:switch|change|set|use)\b.*\b(conservative|balanced|growth)\b/,
  );
  if (stratMatch) {
    return {
      action: 'set_strategy',
      strategy: stratMatch[1] as Strategy,
      confidence: 0.9,
      raw: message,
    };
  }

  // Bare strategy name
  const bareStrat = lower.match(/^(conservative|balanced|growth)$/);
  if (bareStrat) {
    return {
      action: 'set_strategy',
      strategy: bareStrat[1] as Strategy,
      confidence: 0.8,
      raw: message,
    };
  }

  // Fallback: ask for clarification
  return {
    action: 'clarify',
    clarifyingQuestion:
      'I didn\'t understand that. Could you rephrase? For example: "deposit 100 USDC" or "check my balance".',
    confidence: 0.3,
    raw: message,
  };
}

// ─────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────

export interface ParseIntentOptions {
  /** User / session identifier for multi-turn context */
  userId?: string;
  /**
   * When true, skip the LLM and use only the regex parser.
   * Useful for testing or when API keys are not configured.
   */
  forceRegex?: boolean;
}

/**
 * Parse a user message into a structured ParsedIntent.
 *
 * Strategy:
 * 1. Try Anthropic (claude-3-5-haiku) — fastest, cheapest
 * 2. Try OpenAI (gpt-4o-mini) if Anthropic is unavailable
 * 3. Fall back to regex parser if both LLMs are down
 * 4. Validate output with Zod; fall back to regex on schema error
 */
export async function parseIntent(
  message: string,
  options: ParseIntentOptions = {},
): Promise<ParsedIntent> {
  const { userId, forceRegex = false } = options;
  const history = userId ? getConversationHistory(userId) : [];

  let rawJson: string | null = null;
  let usedProvider: string | null = null;

  if (!forceRegex) {
    // ── Attempt Anthropic ──────────────────────────────────────────────────
    if (isAvailable('anthropic') && process.env.ANTHROPIC_API_KEY) {
      try {
        rawJson = await callAnthropic(history, message);
        recordSuccess('anthropic');
        usedProvider = 'anthropic';
      } catch (err) {
        recordFailure('anthropic');
        logger.warn(
          { err: (err as Error).message },
          'Anthropic call failed — trying OpenAI',
        );
      }
    }

    // ── Attempt OpenAI ─────────────────────────────────────────────────────
    if (!rawJson && isAvailable('openai') && process.env.OPENAI_API_KEY) {
      try {
        rawJson = await callOpenAI(history, message);
        recordSuccess('openai');
        usedProvider = 'openai';
      } catch (err) {
        recordFailure('openai');
        logger.warn(
          { err: (err as Error).message },
          'OpenAI call failed — falling back to regex parser',
        );
      }
    }
  }

  // ── Parse & validate LLM output ───────────────────────────────────────────
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const validated = ParsedIntentSchema.parse({ ...parsed, raw: message });

      logger.info(
        { action: validated.action, confidence: validated.confidence, provider: usedProvider },
        'Intent parsed via LLM',
      );

      // Store in conversation history for multi-turn support
      if (userId) {
        appendToHistory(userId, 'user', message);
        appendToHistory(userId, 'assistant', rawJson);
      }

      return validated;
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, rawJson },
        'LLM output failed Zod validation — falling back to regex',
      );
    }
  }

  // ── Regex fallback ─────────────────────────────────────────────────────────
  const regexResult = parseIntentWithRegex(message);

  logger.info(
    { action: regexResult.action, confidence: regexResult.confidence, provider: 'regex' },
    'Intent parsed via regex fallback',
  );

  if (userId) {
    appendToHistory(userId, 'user', message);
  }

  return regexResult;
}

/**
 * Returns true when the intent confidence is too low to execute without
 * asking the user to confirm.
 */
export function needsConfirmation(intent: ParsedIntent): boolean {
  return intent.confidence < LOW_CONFIDENCE_THRESHOLD;
}

/**
 * Returns the breaker state snapshot for observability.
 */
export function getBreakerStates(): Record<string, BreakerState> {
  return Object.fromEntries(
    Object.entries(breakers).map(([k, v]) => [k, v.state]),
  );
}
