/**
 * Intent Parser — NeuroWealth AI Agent
 *
 * Parses natural language user messages into structured vault operations.
 *
 * ## Intent schema
 *
 * | Action          | Required fields       | Optional fields  |
 * |-----------------|-----------------------|------------------|
 * | `deposit`       | action, amount        | strategy         |
 * | `withdraw`      | action, amount        |                  |
 * | `withdraw_all`  | action                |                  |
 * | `check_balance` | action                |                  |
 * | `get_earnings`  | action                |                  |
 * | `set_strategy`  | action, strategy      |                  |
 * | `get_apy`       | action                |                  |
 * | `clarify`       | action, question      |                  |
 * | `error`         | action, reason        |                  |
 *
 * ## Amount encoding
 * All amounts are in **stroops** (7-decimal, 1 USDC = 1_000_000).
 *
 * ## Parsing strategy
 * 1. Try the regex-based `parseIntentFromRegex()` fallback first.
 * 2. If regex is inconclusive, call the LLM via OpenAI key rotation.
 * 3. Validate the response with Zod.
 *
 * @see docs/DESIGN_SYSTEM.md for usage in the WhatsApp / web chat flows.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { openAiKeyManager } from './openAiKeyManager';

// ── Types ───────────────────────────────────────────────────────────────────

export type Action =
  | 'deposit'
  | 'withdraw'
  | 'withdraw_all'
  | 'check_balance'
  | 'get_earnings'
  | 'set_strategy'
  | 'get_apy'
  | 'clarify'
  | 'error';

export type Strategy = 'conservative' | 'balanced' | 'growth';

export type AmountTooSmallReason  = 'amount_too_small';
export type AmountMissingReason   = 'amount_missing';
export type UnknownActionReason   = 'unknown_action';
export type InvalidStrategyReason = 'invalid_strategy';

export type ErrorReason =
  | AmountTooSmallReason
  | AmountMissingReason
  | UnknownActionReason
  | InvalidStrategyReason;

export interface ParsedIntent {
  /** Resolved action */
  action: Action;
  /**
   * Amount in stroops (1 USDC = 1_000_000).
   * Only present for `deposit` and `withdraw`.
   */
  amount?: number;
  /** Strategy preference for `deposit` and `set_strategy` */
  strategy?: Strategy;
  /** Clarifying question for the user when action is `clarify` */
  question?: string;
  /** Machine-readable error reason when action is `error` */
  reason?: ErrorReason;
}

// ── Zod schema ───────────────────────────────────────────────────────────────

/** Minimum deposit / withdraw amount in USDC stroops (1 stroop = 0.0000001 USDC) */
const MIN_AMOUNT_STROOPS = 1_000_000; // 1 USDC

/**
 * Zod schema for the raw JSON the LLM must return.
 *
 * The LLM returns USDC units (e.g., 50); the schema transforms them to
 * stroops by multiplying by 1_000_000.
 */
const llmResponseSchema = z.object({
  action: z.enum([
    'deposit',
    'withdraw',
    'withdraw_all',
    'check_balance',
    'get_earnings',
    'set_strategy',
    'get_apy',
    'clarify',
    'error',
  ]),
  // LLM returns USDC amount as a number; we convert to stroops.
  amount_usdc: z.number().positive().optional(),
  strategy: z.enum(['conservative', 'balanced', 'growth']).optional(),
  question: z.string().optional(),
  reason: z.enum([
    'amount_too_small',
    'amount_missing',
    'unknown_action',
    'invalid_strategy',
  ]).optional(),
});

type LlmResponse = z.infer<typeof llmResponseSchema>;

// ── Regex fallback parser ────────────────────────────────────────────────────

/**
 * Rule-based regex parser — runs before the LLM to handle unambiguous inputs
 * without incurring API latency or cost.
 *
 * Returns `null` when the input is ambiguous and the LLM should be consulted.
 */
export function parseIntentFromRegex(message: string): ParsedIntent | null {
  const clean = message.trim().toLowerCase();

  // ── Balance ──────────────────────────────────────────────────────────────
  if (
    /\bbalance\b/.test(clean) ||
    /how much do i have/.test(clean) ||
    /my funds/.test(clean) ||
    /what('s| is) in my (account|wallet|vault)/.test(clean)
  ) {
    return { action: 'check_balance' };
  }

  // ── APY ──────────────────────────────────────────────────────────────────
  if (
    /\bapy\b/.test(clean) ||
    /what('s| is) my apy/.test(clean) ||
    /interest rate/.test(clean) ||
    /current (yield|rate)/.test(clean)
  ) {
    return { action: 'get_apy' };
  }

  // ── Earnings ─────────────────────────────────────────────────────────────
  if (
    /\bearnings\b/.test(clean) ||
    /how much have i (made|earned)/.test(clean) ||
    /my (profit|yield|returns)/.test(clean)
  ) {
    return { action: 'get_earnings' };
  }

  // ── Strategy ─────────────────────────────────────────────────────────────
  const strategyMatch = clean.match(
    /(?:switch(?: to)?|change(?: to)?|set(?: my)?(?: strategy(?: to)?)?)\s+(conservative|balanced|growth)/,
  );
  if (strategyMatch) {
    return { action: 'set_strategy', strategy: strategyMatch[1] as Strategy };
  }

  // ── Withdraw all ─────────────────────────────────────────────────────────
  if (
    /withdraw\s+(?:all|everything|it all)/.test(clean) ||
    /cash\s+out\s+(?:all|everything)/.test(clean) ||
    /take\s+out\s+everything/.test(clean)
  ) {
    return { action: 'withdraw_all' };
  }

  // ── Withdraw with amount ──────────────────────────────────────────────────
  const withdrawMatch = clean.match(/withdraw\s+(\d+(?:\.\d+)?)\s*(?:usdc)?/);
  if (withdrawMatch) {
    const usdc   = parseFloat(withdrawMatch[1]);
    const amount = Math.round(usdc * 1_000_000);
    if (amount < MIN_AMOUNT_STROOPS) {
      return { action: 'error', reason: 'amount_too_small' };
    }
    return { action: 'withdraw', amount };
  }

  // ── Deposit with amount ───────────────────────────────────────────────────
  const depositMatch = clean.match(/deposit\s+(\d+(?:\.\d+)?)\s*(?:usdc)?/);
  if (depositMatch) {
    const usdc   = parseFloat(depositMatch[1]);
    const amount = Math.round(usdc * 1_000_000);
    if (amount < MIN_AMOUNT_STROOPS) {
      return { action: 'error', reason: 'amount_too_small' };
    }
    // Extract optional strategy
    const stratInDeposit = clean.match(/(?:into|in)\s+(conservative|balanced|growth)\s+strategy/);
    const strategy = stratInDeposit ? (stratInDeposit[1] as Strategy) : undefined;
    return { action: 'deposit', amount, ...(strategy ? { strategy } : {}) };
  }

  // ── Ambiguous deposit (no amount) ────────────────────────────────────────
  if (/\bdeposit\b/.test(clean)) {
    return {
      action:   'clarify',
      question: 'How much USDC would you like to deposit?',
    };
  }

  // ── Ambiguous withdraw (no amount, no "all") ─────────────────────────────
  if (/\bwithdraw\b/.test(clean)) {
    return {
      action:   'clarify',
      question: 'How much USDC would you like to withdraw?',
    };
  }

  // Inconclusive — let the LLM handle it
  return null;
}

// ── LLM-based parser ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an intent parser for the NeuroWealth DeFi assistant.
Parse the user's message and respond with ONLY a JSON object matching this schema:
{
  "action": "deposit" | "withdraw" | "withdraw_all" | "check_balance" | "get_earnings" | "set_strategy" | "get_apy" | "clarify" | "error",
  "amount_usdc": number (USDC units, optional — only for deposit/withdraw),
  "strategy": "conservative" | "balanced" | "growth" (optional),
  "question": string (required when action is "clarify"),
  "reason": "amount_too_small" | "amount_missing" | "unknown_action" | "invalid_strategy" (required when action is "error")
}

Rules:
- "withdraw everything" / "withdraw all" → action = "withdraw_all" (no amount)
- Deposit with 0 USDC or negative amount → action = "error", reason = "amount_too_small"
- Deposit intent with no amount → action = "clarify", question = "How much USDC would you like to deposit?"
- Unknown or ambiguous input → action = "clarify", question = ask for clarification
- amount_usdc must be in USDC (NOT stroops). The system will convert automatically.`;

async function callLlm(message: string): Promise<LlmResponse> {
  const raw = await openAiKeyManager.executeWithRotation(async (openai: OpenAI) => {
    const completion = await openai.chat.completions.create({
      model:          'gpt-4-turbo',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: message },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM');
    return content;
  });

  const parsed = JSON.parse(raw as string) as unknown;
  return llmResponseSchema.parse(parsed);
}

function convertLlmResponse(llm: LlmResponse): ParsedIntent {
  const intent: ParsedIntent = { action: llm.action };
  if (llm.strategy)   intent.strategy = llm.strategy;
  if (llm.question)   intent.question = llm.question;
  if (llm.reason)     intent.reason   = llm.reason;
  if (llm.amount_usdc !== undefined) {
    intent.amount = Math.round(llm.amount_usdc * 1_000_000);
  }
  return intent;
}

// ── Public entry-point ───────────────────────────────────────────────────────

/**
 * Parse a natural language user message into a structured `ParsedIntent`.
 *
 * Tries the regex fallback first; falls back to the LLM for ambiguous inputs.
 *
 * @param message  Raw user message (WhatsApp / chat)
 * @returns        Structured intent ready for the vault client or chat handler
 */
export async function parseIntent(message: string): Promise<ParsedIntent> {
  // 1. Try fast regex-based parser
  const fast = parseIntentFromRegex(message);
  if (fast !== null) return fast;

  // 2. Fall back to LLM
  const llm = await callLlm(message);
  return convertLlmResponse(llm);
}
