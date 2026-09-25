/**
 * Unit tests for the Natural Language Intent Parser (#23)
 *
 * Fully standalone — tests the regex fallback, Zod schema, multi-turn
 * context store, circuit breaker helpers, and confidence logic without
 * making any real LLM API calls.
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

test('clarify intent needs confirmation (low confidence)', () => {
  const r = parseIntentWithRegex('blah blah blah');
  assert.strictEqual(needsConfirmation(r), true);
});

test('bare strategy has moderate confidence < threshold?', () => {
  // confidence is 0.8 which is >= 0.7 — should NOT need confirmation
  const r = parseIntentWithRegex('balanced');
  assert.strictEqual(needsConfirmation(r), false);
});

// ── Zod schema validation ─────────────────────────────────────────────────────
console.log('\n  [Zod schema]');

test('valid deposit object passes schema', () => {
  const obj = { action: 'deposit', amount: 100, confidence: 0.9, raw: 'deposit 100' };
  const result = ParsedIntentSchema.safeParse(obj);
  assert.ok(result.success);
});

test('negative amount fails schema', () => {
  const obj = { action: 'deposit', amount: -50, confidence: 0.9, raw: 'test' };
  const result = ParsedIntentSchema.safeParse(obj);
  assert.strictEqual(result.success, false);
});

test('unknown action fails schema', () => {
  const obj = { action: 'fly_to_moon', confidence: 0.9, raw: 'test' };
  const result = ParsedIntentSchema.safeParse(obj);
  assert.strictEqual(result.success, false);
});

test('confidence above 1.0 fails schema', () => {
  const obj = { action: 'check_balance', confidence: 1.5, raw: 'test' };
  const result = ParsedIntentSchema.safeParse(obj);
  assert.strictEqual(result.success, false);
});

test('confidence defaults to 1 when omitted', () => {
  const obj = { action: 'check_balance', raw: 'test' };
  const result = ParsedIntentSchema.safeParse(obj);
  assert.ok(result.success);
  assert.strictEqual((result as any).data.confidence, 1);
});

// ── Circuit breaker ───────────────────────────────────────────────────────────
console.log('\n  [circuit breaker]');

test('breaker starts CLOSED', () => {
  const b = makeCB();
  assert.strictEqual(b.state, 'CLOSED');
  assert.strictEqual(isAvailable(b), true);
});

test('3 failures open the breaker', () => {
  const b = makeCB();
  recordFailure(b); recordFailure(b); recordFailure(b);
  assert.strictEqual(b.state, 'OPEN');
  assert.strictEqual(isAvailable(b), false);
});

test('open breaker becomes HALF_OPEN after recovery timeout', () => {
  const b = makeCB();
  const now = Date.now();
  recordFailure(b, now); recordFailure(b, now); recordFailure(b, now);
  assert.strictEqual(isAvailable(b, now + RECOVERY_TIMEOUT_MS + 1), true);
  assert.strictEqual(b.state, 'HALF_OPEN');
});

test('two successes in HALF_OPEN close the breaker', () => {
  const b = makeCB();
  const now = Date.now();
  recordFailure(b, now); recordFailure(b, now); recordFailure(b, now);
  isAvailable(b, now + RECOVERY_TIMEOUT_MS + 1); // transition to HALF_OPEN
  recordSuccess(b); recordSuccess(b);
  assert.strictEqual(b.state, 'CLOSED');
});

// ── Multi-turn context ────────────────────────────────────────────────────────
console.log('\n  [multi-turn context]');

test('history grows with each append', () => {
  conversationHistory.clear();
  appendToHistory('user1', 'user', 'deposit 100');
  appendToHistory('user1', 'assistant', '{"action":"deposit","amount":100}');
  assert.strictEqual(conversationHistory.get('user1')!.length, 2);
});

test('history is capped at MAX_HISTORY_TURNS', () => {
  conversationHistory.clear();
  for (let i = 0; i < MAX_HISTORY_TURNS + 4; i++) {
    appendToHistory('user2', 'user', `msg ${i}`);
  }
  assert.strictEqual(conversationHistory.get('user2')!.length, MAX_HISTORY_TURNS);
});

test('different users have independent histories', () => {
  conversationHistory.clear();
  appendToHistory('alice', 'user', 'deposit 100');
  appendToHistory('bob', 'user', 'check balance');
  assert.strictEqual(conversationHistory.get('alice')!.length, 1);
  assert.strictEqual(conversationHistory.get('bob')!.length, 1);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
