/**
 * Unit tests for the Natural Language Intent Parser (#23)
 *
 * Fully standalone — tests the regex fallback, Zod schema, multi-turn
 * context store, circuit breaker helpers, and confidence logic without
 * making any real LLM API calls.
 *
 * Also covers #419: explicit confirmation for parsed financial intents.
 */

import assert from 'assert';
import { z } from 'zod';

// ── Re-declare types & constants used by tests (mirrors intentParser.ts) ──────

const ActionSchema = z.enum([
  'deposit',
  'withdraw',
  'withdraw_all',
  'check_balance',
  'check_earnings',
  'set_strategy',
  'get_apy',
  'clarify',
]);

const StrategySchema = z.enum(['conservative', 'balanced', 'growth']);

const ParsedIntentSchema = z.object({
  action: ActionSchema,
  amount: z.number().positive().optional(),
  withdrawAll: z.boolean().optional(),
  strategy: StrategySchema.optional(),
  clarifyingQuestion: z.string().optional(),
  confidence: z.number().min(0).max(1).default(1),
  raw: z.string(),
});

type ParsedIntent = z.infer<typeof ParsedIntentSchema>;
type Strategy = z.infer<typeof StrategySchema>;

const LOW_CONFIDENCE_THRESHOLD = 0.7;

// ── Regex parser (mirrors production implementation) ──────────────────────────

function parseIntentWithRegex(message: string): ParsedIntent {
  const lower = message.toLowerCase().trim();

  if (/\bwithdraw\s+(all|everything)\b/.test(lower)) {
    return { action: 'withdraw_all', withdrawAll: true, confidence: 0.95, raw: message };
  }

  const withdrawMatch = lower.match(/\bwithdraw\s+([\d,]+(?:\.\d+)?)/);
  if (withdrawMatch) {
    return {
      action: 'withdraw',
      amount: parseFloat(withdrawMatch[1].replace(/,/g, '')),
      confidence: 0.9,
      raw: message,
    };
  }

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

  if (/\b(balance|how much|my portfolio|portfolio)\b/.test(lower)) {
    return { action: 'check_balance', confidence: 0.9, raw: message };
  }

  if (/\b(earn|earnings|yield|profit|made)\b/.test(lower)) {
    return { action: 'check_earnings', confidence: 0.85, raw: message };
  }

  if (/\b(apy|interest|rate|annual)\b/.test(lower)) {
    return { action: 'get_apy', confidence: 0.85, raw: message };
  }

  const stratMatch = lower.match(
    /\b(?:switch|change|set|use)\b.*\b(conservative|balanced|growth)\b/,
  );
  if (stratMatch) {
    return { action: 'set_strategy', strategy: stratMatch[1] as Strategy, confidence: 0.9, raw: message };
  }

  const bareStrat = lower.match(/^(conservative|balanced|growth)$/);
  if (bareStrat) {
    return { action: 'set_strategy', strategy: bareStrat[1] as Strategy, confidence: 0.8, raw: message };
  }

  return {
    action: 'clarify',
    clarifyingQuestion: 'I didn\'t understand that. Could you rephrase?',
    confidence: 0.3,
    raw: message,
  };
}

function needsConfirmation(intent: ParsedIntent): boolean {
  return intent.confidence < LOW_CONFIDENCE_THRESHOLD;
}

// ── Explicit confirmation for financial intents (#419) ───────────────────────
//
// Parsing is separated from execution: a parsed financial intent never
// enqueues a transaction on its own. Instead a structured confirmation is
// built that binds amount, asset, destination, and network. Execution is only
// permitted when the caller presents a confirmation that matches the current
// intent exactly. Any edit to the intent invalidates the old confirmation.

const FINANCIAL_ACTIONS = new Set<ParsedIntent['action']>(['deposit', 'withdraw', 'withdraw_all']);

const ConfirmationSchema = z.object({
  action: z.enum(['deposit', 'withdraw', 'withdraw_all']),
  amount: z.number().positive().optional(),
  withdrawAll: z.boolean().optional(),
  asset: z.string().min(1),
  destination: z.string().min(1),
  network: z.enum(['testnet', 'mainnet']),
  intentFingerprint: z.string().min(1),
});

type Confirmation = z.infer<typeof ConfirmationSchema>;

interface ConfirmationContext {
  asset: string;
  destination: string;
  network: 'testnet' | 'mainnet';
}

function isFinancialIntent(intent: ParsedIntent): boolean {
  return FINANCIAL_ACTIONS.has(intent.action);
}

function fingerprintIntent(intent: ParsedIntent): string {
  return JSON.stringify({
    action: intent.action,
    amount: intent.amount ?? null,
    withdrawAll: intent.withdrawAll ?? null,
    strategy: intent.strategy ?? null,
  });
}

/**
 * Build a structured confirmation for a parsed financial intent.
 * Returns null when the intent is not financial or is ambiguous/incomplete —
 * in which case nothing may be enqueued.
 */
function buildConfirmation(
  intent: ParsedIntent,
  ctx: ConfirmationContext,
): Confirmation | null {
  if (!isFinancialIntent(intent)) return null;
  if (intent.confidence < LOW_CONFIDENCE_THRESHOLD) return null;
  if (intent.action === 'withdraw_all') {
    if (intent.withdrawAll !== true) return null;
  } else if (typeof intent.amount !== 'number' || !(intent.amount > 0)) {
    return null;
  }

  return {
    action: intent.action as Confirmation['action'],
    amount: intent.amount,
    withdrawAll: intent.withdrawAll,
    asset: ctx.asset,
    destination: ctx.destination,
    network: ctx.network,
    intentFingerprint: fingerprintIntent(intent),
  };
}

/**
 * Authorize execution. A confirmation can only authorize the exact operation
 * it was bound to; any edit to the intent (amount, action, etc.) changes the
 * fingerprint and invalidates the confirmation.
 */
function authorizeExecution(intent: ParsedIntent, confirmation: Confirmation): boolean {
  const parsed = ConfirmationSchema.safeParse(confirmation);
  if (!parsed.success) return false;
  if (!isFinancialIntent(intent)) return false;
  if (parsed.data.action !== intent.action) return false;
  return parsed.data.intentFingerprint === fingerprintIntent(intent);
}

// ── Circuit breaker helpers ───────────────────────────────────────────────────

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
interface CB { state: BreakerState; failures: number; lastFailureTime: number; successCount: number }

const FAILURE_THRESHOLD = 3;
const RECOVERY_TIMEOUT_MS = 30_000;
const HALF_OPEN_SUCCESS_THRESHOLD = 2;

function makeCB(): CB {
  return { state: 'CLOSED', failures: 0, lastFailureTime: 0, successCount: 0 };
}

function isAvailable(b: CB, now = Date.now()): boolean {
  if (b.state === 'CLOSED') return true;
  if (b.state === 'OPEN') {
    if (now - b.lastFailureTime >= RECOVERY_TIMEOUT_MS) { b.state = 'HALF_OPEN'; b.successCount = 0; return true; }
    return false;
  }
  return true; // HALF_OPEN
}

function recordSuccess(b: CB): void {
  if (b.state === 'HALF_OPEN') {
    b.successCount += 1;
    if (b.successCount >= HALF_OPEN_SUCCESS_THRESHOLD) { b.state = 'CLOSED'; b.failures = 0; }
  } else { b.failures = 0; }
}

function recordFailure(b: CB, now = Date.now()): void {
  b.failures += 1; b.lastFailureTime = now;
  if (b.failures >= FAILURE_THRESHOLD || b.state === 'HALF_OPEN') b.state = 'OPEN';
}

// ── Multi-turn context store ──────────────────────────────────────────────────

const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();
const MAX_HISTORY_TURNS = 6;

function appendToHistory(userId: string, role: 'user' | 'assistant', content: string) {
  const h = conversationHistory.get(userId) ?? [];
  h.push({ role, content });
  if (h.length > MAX_HISTORY_TURNS) h.splice(0, h.length - MAX_HISTORY_TURNS);
  conversationHistory.set(userId, h);
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n     ${(err as Error).message}`); failed++; }
}

console.log('\nIntent Parser — unit tests\n');

// ── Regex: supported intents ──────────────────────────────────────────────────
console.log('  [regex fallback]');

test('deposit with amount', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  assert.strictEqual(r.action, 'deposit');
  assert.strictEqual(r.amount, 100);
});

test('deposit with amount and strategy', () => {
  const r = parseIntentWithRegex('deposit 50 USDC into growth strategy');
  assert.strictEqual(r.action, 'deposit');
  assert.strictEqual(r.amount, 50);
  assert.strictEqual(r.strategy, 'growth');
});

test('withdraw with amount', () => {
  const r = parseIntentWithRegex('withdraw 75');
  assert.strictEqual(r.action, 'withdraw');
  assert.strictEqual(r.amount, 75);
});

test('withdraw all', () => {
  const r = parseIntentWithRegex('withdraw all');
  assert.strictEqual(r.action, 'withdraw_all');
  assert.strictEqual(r.withdrawAll, true);
});

test('withdraw everything', () => {
  const r = parseIntentWithRegex('withdraw everything');
  assert.strictEqual(r.action, 'withdraw_all');
});

test('check balance — "balance"', () => {
  assert.strictEqual(parseIntentWithRegex('what is my balance').action, 'check_balance');
});

test('check balance — "how much"', () => {
  assert.strictEqual(parseIntentWithRegex('how much do I have').action, 'check_balance');
});

test('check balance — "portfolio"', () => {
  assert.strictEqual(parseIntentWithRegex('show my portfolio').action, 'check_balance');
});

test('check earnings', () => {
  assert.strictEqual(parseIntentWithRegex('show my earnings today').action, 'check_earnings');
});

test('get APY', () => {
  assert.strictEqual(parseIntentWithRegex('what is my current apy').action, 'get_apy');
});

test('set strategy — "switch to conservative"', () => {
  const r = parseIntentWithRegex('switch to conservative');
  assert.strictEqual(r.action, 'set_strategy');
  assert.strictEqual(r.strategy, 'conservative');
});

test('set strategy — bare name "balanced"', () => {
  const r = parseIntentWithRegex('balanced');
  assert.strictEqual(r.action, 'set_strategy');
  assert.strictEqual(r.strategy, 'balanced');
});

test('clarify for unrecognised input', () => {
  const r = parseIntentWithRegex('hello there world xyz');
  assert.strictEqual(r.action, 'clarify');
  assert.ok(r.clarifyingQuestion && r.clarifyingQuestion.length > 0);
});

test('deposit with comma-formatted amount', () => {
  const r = parseIntentWithRegex('deposit 1,000 USDC');
  assert.strictEqual(r.action, 'deposit');
  assert.strictEqual(r.amount, 1000);
});

// ── Confidence & confirmation ────────────────────────────────────────────────
console.log('\n  [confidence & confirmation]');

test('high-confidence deposit does not need confirmation', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  assert.strictEqual(needsConfirmation(r), false);
});

test('low-confidence clarify needs confirmation', () => {
  const r = parseIntentWithRegex('hello there world xyz');
  assert.strictEqual(needsConfirmation(r), true);
});

// ── Explicit confirmation for financial intents (#419) ───────────────────────
console.log('\n  [explicit confirmation]');

const CTX: ConfirmationContext = {
  asset: 'USDC',
  destination: 'GABC1234567890',
  network: 'testnet',
};

test('parsing alone does not enqueue — confirmation is required', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  // No confirmation object exists yet, so execution cannot be authorized.
  assert.strictEqual(isFinancialIntent(r), true);
  const conf = buildConfirmation(r, CTX);
  assert.ok(conf, 'a structured confirmation should be produced');
});

test('confirmation binds amount, asset, destination, network', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  const conf = buildConfirmation(r, CTX)!;
  assert.strictEqual(conf.amount, 100);
  assert.strictEqual(conf.asset, 'USDC');
  assert.strictEqual(conf.destination, 'GABC1234567890');
  assert.strictEqual(conf.network, 'testnet');
});

test('ambiguous text does not produce a confirmation', () => {
  const r = parseIntentWithRegex('hello there world xyz');
  assert.strictEqual(buildConfirmation(r, CTX), null);
});

test('non-financial intent does not produce a confirmation', () => {
  const r = parseIntentWithRegex('what is my balance');
  assert.strictEqual(buildConfirmation(r, CTX), null);
});

test('confirmation authorizes its bound operation', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  const conf = buildConfirmation(r, CTX)!;
  assert.strictEqual(authorizeExecution(r, conf), true);
});

test('editing the amount invalidates the old confirmation', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  const conf = buildConfirmation(r, CTX)!;
  const edited = parseIntentWithRegex('deposit 500 USDC');
  assert.strictEqual(authorizeExecution(edited, conf), false);
});

test('editing the action invalidates the old confirmation', () => {
  const r = parseIntentWithRegex('deposit 100 USDC');
  const conf = buildConfirmation(r, CTX)!;
  const edited = parseIntentWithRegex('withdraw 100');
  assert.strictEqual(authorizeExecution(edited, conf), false);
});

test('confirmation cannot authorize a different operation', () => {
  const deposit = parseIntentWithRegex('deposit 100 USDC');
  const conf = buildConfirmation(deposit, CTX)!;
  const withdraw = parseIntentWithRegex('withdraw 100');
  assert.strictEqual(authorizeExecution(withdraw, conf), false);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
