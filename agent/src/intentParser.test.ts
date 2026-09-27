/**
 * Intent Parser Unit Tests — Issue #94
 *
 * Comprehensive tests for the AI intent parser covering:
 *   - All supported intents (deposit, withdraw, withdraw_all, check_balance,
 *     get_earnings, set_strategy, get_apy)
 *   - Ambiguous inputs → clarify
 *   - Invalid amounts → error
 *   - Rule-based regex fallback tested independently
 *   - Zod schema validation tested separately
 *   - LLM path tested with fixed response fixtures (no real API calls)
 *
 * MOCKING STRATEGY
 * The LLM is mocked by monkey-patching the `openAiKeyManager` module
 * used inside `parseIntent`.  Each test that exercises the LLM path
 * injects a fixture response through `mockLlm()` and restores the
 * original after the assertion.  The regex path is tested directly via
 * the exported `parseIntentFromRegex()` function — no mocking needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ────────────────────────────────────────────────────────────────────────────
// Import the module under test.  We import *before* mocking so TypeScript's
// module cache is warm; the mock patches the shared singleton at runtime.
// ────────────────────────────────────────────────────────────────────────────
import { parseIntentFromRegex } from './intentParser.js';

// ── LLM mock helpers ─────────────────────────────────────────────────────────

/**
 * Build a minimal OpenAI-shaped response fixture from a JSON string.
 * `openAiKeyManager.executeWithRotation` receives a callback; we replace the
 * manager with a stub that immediately resolves to the fixture.
 */
function buildLlmFixture(jsonString: string) {
  return {
    choices: [{ message: { content: jsonString } }],
  };
}

/**
 * Temporarily replace `openAiKeyManager.executeWithRotation` with a version
 * that returns a fixed JSON string.  Returns a restore function.
 */
async function withMockedLlm(
  jsonString: string,
  fn: () => Promise<void>,
): Promise<void> {
  // Dynamic import so we can mutate the live export
  const keyManagerModule = await import('./openAiKeyManager.js');
  const manager = (keyManagerModule as { openAiKeyManager: { executeWithRotation: unknown } }).openAiKeyManager;
  const original = (manager as { executeWithRotation: (...args: unknown[]) => unknown }).executeWithRotation.bind(manager);

  // Stub: ignore the callback, return the fixture content string directly
  (manager as { executeWithRotation: (...args: unknown[]) => Promise<string> }).executeWithRotation =
    async (_cb: unknown) => jsonString;

  try {
    await fn();
  } finally {
    (manager as { executeWithRotation: (...args: unknown[]) => unknown }).executeWithRotation = original;
  }
}

// ── Regex fallback parser tests ──────────────────────────────────────────────

describe('parseIntentFromRegex — rule-based fallback parser', () => {

  // ── deposit ─────────────────────────────────────────────────────────────

  it('"deposit 50 USDC" → { action: deposit, amount: 50000000 }', () => {
    const result = parseIntentFromRegex('deposit 50 USDC');
    assert.ok(result, 'must not return null');
    assert.strictEqual(result.action, 'deposit');
    assert.strictEqual(result.amount, 50_000_000);
  });

  it('"deposit 1.5 usdc" converts decimal USDC to stroops', () => {
    const result = parseIntentFromRegex('deposit 1.5 usdc');
    assert.ok(result);
    assert.strictEqual(result.action, 'deposit');
    assert.strictEqual(result.amount, 1_500_000);
  });

  it('"deposit 50 USDC into balanced strategy" extracts strategy', () => {
    const result = parseIntentFromRegex('deposit 50 USDC into balanced strategy');
    assert.ok(result);
    assert.strictEqual(result.action, 'deposit');
    assert.strictEqual(result.amount, 50_000_000);
    assert.strictEqual(result.strategy, 'balanced');
  });

  it('"deposit 100 USDC into conservative strategy" extracts conservative', () => {
    const result = parseIntentFromRegex('deposit 100 USDC into conservative strategy');
    assert.ok(result);
    assert.strictEqual(result.strategy, 'conservative');
  });

  it('"deposit 0 USDC" → { action: error, reason: amount_too_small }', () => {
    const result = parseIntentFromRegex('deposit 0 USDC');
    assert.ok(result);
    assert.strictEqual(result.action, 'error');
    assert.strictEqual(result.reason, 'amount_too_small');
  });

  it('"deposit 0.0000001 USDC" (below 1 USDC minimum) → error amount_too_small', () => {
    const result = parseIntentFromRegex('deposit 0.0000001 USDC');
    assert.ok(result);
    assert.strictEqual(result.action, 'error');
    assert.strictEqual(result.reason, 'amount_too_small');
  });

  // ── withdraw ─────────────────────────────────────────────────────────────

  it('"withdraw everything" → { action: withdraw_all }', () => {
    const result = parseIntentFromRegex('withdraw everything');
    assert.ok(result);
    assert.strictEqual(result.action, 'withdraw_all');
  });

  it('"withdraw all" → { action: withdraw_all }', () => {
    const result = parseIntentFromRegex('withdraw all');
    assert.ok(result);
    assert.strictEqual(result.action, 'withdraw_all');
  });

  it('"Withdraw All" (case-insensitive) → { action: withdraw_all }', () => {
    const result = parseIntentFromRegex('Withdraw All');
    assert.ok(result);
    assert.strictEqual(result.action, 'withdraw_all');
  });

  it('"withdraw it all" → { action: withdraw_all }', () => {
    const result = parseIntentFromRegex('withdraw it all');
    assert.ok(result);
    assert.strictEqual(result.action, 'withdraw_all');
  });

  it('"withdraw 25 USDC" → { action: withdraw, amount: 25000000 }', () => {
    const result = parseIntentFromRegex('withdraw 25 USDC');
    assert.ok(result);
    assert.strictEqual(result.action, 'withdraw');
    assert.strictEqual(result.amount, 25_000_000);
  });

  it('"withdraw 0 USDC" → { action: error, reason: amount_too_small }', () => {
    const result = parseIntentFromRegex('withdraw 0 USDC');
    assert.ok(result);
    assert.strictEqual(result.action, 'error');
    assert.strictEqual(result.reason, 'amount_too_small');
  });

  // ── check_balance ────────────────────────────────────────────────────────

  it('"what is my balance" → { action: check_balance }', () => {
    const result = parseIntentFromRegex('what is my balance');
    assert.ok(result);
    assert.strictEqual(result.action, 'check_balance');
  });

  it('"how much do I have" → { action: check_balance }', () => {
    const result = parseIntentFromRegex('how much do I have');
    assert.ok(result);
    assert.strictEqual(result.action, 'check_balance');
  });

  it('"show my balance" → { action: check_balance }', () => {
    const result = parseIntentFromRegex('show my balance');
    assert.ok(result);
    assert.strictEqual(result.action, 'check_balance');
  });

  it('"what\'s in my wallet" → { action: check_balance }', () => {
    const result = parseIntentFromRegex("what's in my wallet");
    assert.ok(result);
    assert.strictEqual(result.action, 'check_balance');
  });

  // ── get_apy ──────────────────────────────────────────────────────────────

  it('"what is my APY" → { action: get_apy }', () => {
    const result = parseIntentFromRegex('what is my APY');
    assert.ok(result);
    assert.strictEqual(result.action, 'get_apy');
  });

  it('"current yield" → { action: get_apy }', () => {
    const result = parseIntentFromRegex('current yield');
    assert.ok(result);
    assert.strictEqual(result.action, 'get_apy');
  });

  it('"interest rate" → { action: get_apy }', () => {
    const result = parseIntentFromRegex('interest rate');
    assert.ok(result);
    assert.strictEqual(result.action, 'get_apy');
  });

  // ── get_earnings ─────────────────────────────────────────────────────────

  it('"how much have I made" → { action: get_earnings }', () => {
    const result = parseIntentFromRegex('how much have I made');
    assert.ok(result);
    assert.strictEqual(result.action, 'get_earnings');
  });

  it('"show my earnings" → { action: get_earnings }', () => {
    const result = parseIntentFromRegex('show my earnings');
    assert.ok(result);
    assert.strictEqual(result.action, 'get_earnings');
  });

  it('"my profit" → { action: get_earnings }', () => {
    const result = parseIntentFromRegex('my profit');
    assert.ok(result);
    assert.strictEqual(result.action, 'get_earnings');
  });

  // ── set_strategy ─────────────────────────────────────────────────────────

  it('"switch to growth strategy" → { action: set_strategy, strategy: growth }', () => {
    const result = parseIntentFromRegex('switch to growth strategy');
    assert.ok(result);
    assert.strictEqual(result.action, 'set_strategy');
    assert.strictEqual(result.strategy, 'growth');
  });

  it('"switch to conservative" → { action: set_strategy, strategy: conservative }', () => {
    const result = parseIntentFromRegex('switch to conservative');
    assert.ok(result);
    assert.strictEqual(result.action, 'set_strategy');
    assert.strictEqual(result.strategy, 'conservative');
  });

  it('"change to balanced" → { action: set_strategy, strategy: balanced }', () => {
    const result = parseIntentFromRegex('change to balanced');
    assert.ok(result);
    assert.strictEqual(result.action, 'set_strategy');
    assert.strictEqual(result.strategy, 'balanced');
  });

  it('"set strategy to growth" → { action: set_strategy, strategy: growth }', () => {
    const result = parseIntentFromRegex('set strategy to growth');
    assert.ok(result);
    assert.strictEqual(result.action, 'set_strategy');
    assert.strictEqual(result.strategy, 'growth');
  });

  // ── clarify ──────────────────────────────────────────────────────────────

  it('"do the deposit" (no amount) → { action: clarify }', () => {
    const result = parseIntentFromRegex('do the deposit');
    assert.ok(result);
    assert.strictEqual(result.action, 'clarify');
    assert.ok(
      result.question?.toLowerCase().includes('how much'),
      'clarifying question must ask for the amount',
    );
  });

  it('"just deposit" (no amount) → clarify with deposit question', () => {
    const result = parseIntentFromRegex('just deposit');
    assert.ok(result);
    assert.strictEqual(result.action, 'clarify');
    assert.ok(result.question?.toLowerCase().includes('deposit'));
  });

  it('"I want to withdraw" (no amount, no "all") → clarify with withdraw question', () => {
    const result = parseIntentFromRegex('I want to withdraw');
    assert.ok(result);
    assert.strictEqual(result.action, 'clarify');
    assert.ok(result.question?.toLowerCase().includes('withdraw'));
  });

  // ── inconclusive (returns null) ───────────────────────────────────────────

  it('completely unrelated message → returns null (LLM needed)', () => {
    const result = parseIntentFromRegex('hello there, I need help');
    assert.strictEqual(result, null, 'inconclusive message must return null');
  });

  it('empty string → returns null', () => {
    const result = parseIntentFromRegex('');
    assert.strictEqual(result, null);
  });
});

// ── Zod schema validation tests ──────────────────────────────────────────────

describe('Zod schema validation (intentParser internal schema)', () => {
  it('rejects LLM response with unknown action via ZodError', async () => {
    const { z } = await import('zod');
    // Replicate the schema to test it in isolation
    const schema = z.object({
      action: z.enum([
        'deposit', 'withdraw', 'withdraw_all', 'check_balance',
        'get_earnings', 'set_strategy', 'get_apy', 'clarify', 'error',
      ]),
      amount_usdc: z.number().positive().optional(),
      strategy: z.enum(['conservative', 'balanced', 'growth']).optional(),
      question: z.string().optional(),
      reason: z.enum([
        'amount_too_small', 'amount_missing', 'unknown_action', 'invalid_strategy',
      ]).optional(),
    });

    const badPayload = { action: 'dance', amount_usdc: 10 };
    const result = schema.safeParse(badPayload);
    assert.strictEqual(result.success, false, 'unknown action must fail validation');
  });

  it('rejects negative amount_usdc', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      action: z.enum(['deposit']),
      amount_usdc: z.number().positive().optional(),
    });

    const result = schema.safeParse({ action: 'deposit', amount_usdc: -5 });
    assert.strictEqual(result.success, false, 'negative amount must fail validation');
  });

  it('accepts valid deposit response', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      action: z.enum([
        'deposit', 'withdraw', 'withdraw_all', 'check_balance',
        'get_earnings', 'set_strategy', 'get_apy', 'clarify', 'error',
      ]),
      amount_usdc: z.number().positive().optional(),
      strategy: z.enum(['conservative', 'balanced', 'growth']).optional(),
      question: z.string().optional(),
      reason: z.enum([
        'amount_too_small', 'amount_missing', 'unknown_action', 'invalid_strategy',
      ]).optional(),
    });

    const good = { action: 'deposit', amount_usdc: 50, strategy: 'balanced' };
    const result = schema.safeParse(good);
    assert.strictEqual(result.success, true, 'valid deposit payload must pass');
  });

  it('accepts valid withdraw_all response (no amount)', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      action: z.enum([
        'deposit', 'withdraw', 'withdraw_all', 'check_balance',
        'get_earnings', 'set_strategy', 'get_apy', 'clarify', 'error',
      ]),
      amount_usdc: z.number().positive().optional(),
      strategy: z.enum(['conservative', 'balanced', 'growth']).optional(),
    });

    const payload = { action: 'withdraw_all' };
    const result = schema.safeParse(payload);
    assert.strictEqual(result.success, true, 'withdraw_all without amount must pass');
  });
});

// ── LLM-path tests (mocked) ───────────────────────────────────────────────────

describe('parseIntent — LLM path with mocked responses', () => {

  it('"deposit 50 USDC" (LLM) → { action: deposit, amount: 50000000 }', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'deposit', amount_usdc: 50 }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        // Bypass regex (regex would handle this, but we want LLM path)
        // Use a message that the regex returns null for
        const result = await parseIntent('put fifty dollars into balanced');
        assert.strictEqual(result.action, 'deposit');
        assert.strictEqual(result.amount, 50_000_000);
      },
    );
  });

  it('"withdraw everything" (LLM) → { action: withdraw_all }', async () => {
    // This hits the regex first — test LLM path with a phrasing regex misses
    await withMockedLlm(
      JSON.stringify({ action: 'withdraw_all' }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        const result = await parseIntent('liquidate my full position please');
        assert.strictEqual(result.action, 'withdraw_all');
        assert.strictEqual(result.amount, undefined);
      },
    );
  });

  it('"how much do I have" (LLM) → { action: check_balance }', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'check_balance' }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        const result = await parseIntent("show me what's in my vault right now");
        assert.strictEqual(result.action, 'check_balance');
      },
    );
  });

  it('"switch to growth strategy" (LLM) → { action: set_strategy, strategy: growth }', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'set_strategy', strategy: 'growth' }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        const result = await parseIntent('go aggressive with growth');
        assert.strictEqual(result.action, 'set_strategy');
        assert.strictEqual(result.strategy, 'growth');
      },
    );
  });

  it('"what is my APY" (LLM) → { action: get_apy }', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'get_apy' }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        const result = await parseIntent('what rate am I currently earning');
        assert.strictEqual(result.action, 'get_apy');
      },
    );
  });

  it('ambiguous "do the deposit" (LLM) → { action: clarify, question: … }', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'clarify', question: 'How much USDC would you like to deposit?' }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        // Force regex to return null by using phrasing it won't match exactly
        const result = await parseIntent('I need to do the deposit thing');
        assert.strictEqual(result.action, 'clarify');
        assert.ok(
          typeof result.question === 'string' && result.question.length > 0,
          'clarify must include a question for the user',
        );
      },
    );
  });

  it('"deposit 0 USDC" (LLM) → { action: error, reason: amount_too_small }', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'error', reason: 'amount_too_small' }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        // Use a phrasing that bypasses regex
        const result = await parseIntent('deposit zero USDC for me');
        assert.strictEqual(result.action, 'error');
        assert.strictEqual(result.reason, 'amount_too_small');
      },
    );
  });

  it('LLM returning invalid JSON schema throws / rejects', async () => {
    await withMockedLlm(
      JSON.stringify({ action: 'fly_to_moon', amount_usdc: -1 }),
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        await assert.rejects(
          () => parseIntent('completely nonsensical input that bypasses regex 12345xyz'),
          (err: unknown) => {
            // Should throw a ZodError or related validation error
            assert.ok(err instanceof Error, 'must throw an Error');
            return true;
          },
        );
      },
    );
  });

  it('LLM returning empty content throws', async () => {
    await withMockedLlm(
      '',
      async () => {
        const { parseIntent } = await import('./intentParser.js');
        await assert.rejects(
          () => parseIntent('anything that bypasses regex qqqq'),
          Error,
          'empty LLM response must throw',
        );
      },
    );
  });
});

// ── Amount conversion edge cases ──────────────────────────────────────────────

describe('Amount conversion — USDC → stroops', () => {
  it('1 USDC = 1_000_000 stroops', () => {
    const r = parseIntentFromRegex('deposit 1 USDC');
    assert.strictEqual(r?.amount, 1_000_000);
  });

  it('0.5 USDC = 500_000 stroops', () => {
    const r = parseIntentFromRegex('deposit 0.5 USDC');
    assert.strictEqual(r?.amount, 500_000);
  });

  it('10000 USDC = 10_000_000_000 stroops', () => {
    const r = parseIntentFromRegex('deposit 10000 USDC');
    assert.strictEqual(r?.amount, 10_000_000_000);
  });

  it('withdraw 7.75 USDC = 7_750_000 stroops', () => {
    const r = parseIntentFromRegex('withdraw 7.75 USDC');
    assert.strictEqual(r?.amount, 7_750_000);
  });

  it('deposit with no amount → clarify (no amount field)', () => {
    const r = parseIntentFromRegex('deposit');
    assert.ok(r);
    assert.strictEqual(r.action, 'clarify');
    assert.strictEqual(r.amount, undefined);
  });
});
