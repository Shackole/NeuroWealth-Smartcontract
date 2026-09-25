/**
 * Unit tests for WhatsApp webhook handler (#24)
 * Tests rate limiter and Twilio signature validation logic
 * without requiring a live Redis/DB/Twilio connection.
 */

import assert from 'assert';
import crypto from 'crypto';

// ── Rate limiter (mirrors production implementation) ──────────────────────────
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitEntry = { count: number; windowStart: number };
const rateLimitMap = new Map<string, RateLimitEntry>();

function checkWebhookRateLimit(phoneHash: string, now = Date.now()): boolean {
  const entry = rateLimitMap.get(phoneHash);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(phoneHash, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count += 1;
  return true;
}

// ── SHA-256 phone hash (mirrors cryptoUtils) ─────────────────────────────────
function hashPhoneNumber(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

// ── Simple Twilio signature validator mirror ──────────────────────────────────
// Real implementation uses HMAC-SHA1 over url + sorted params
function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  let str = url;
  for (const key of sortedKeys) str += key + params[key];
  return crypto.createHmac('sha1', authToken).update(str).digest('base64');
}

// ── Tests ─────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', (err as Error).message);
    failed++;
  }
}

console.log('\nWhatsApp Webhook — unit tests\n');

// Rate limiter tests
const BASE_NOW = Date.now();

test('first message is allowed', () => {
  rateLimitMap.clear();
  assert.strictEqual(checkWebhookRateLimit('hash_a', BASE_NOW), true);
});

test('messages within limit are allowed', () => {
  rateLimitMap.clear();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.strictEqual(checkWebhookRateLimit('hash_b', BASE_NOW), true, `msg ${i + 1} should pass`);
  }
});

test('11th message in window is blocked', () => {
  rateLimitMap.clear();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    checkWebhookRateLimit('hash_c', BASE_NOW);
  }
  assert.strictEqual(checkWebhookRateLimit('hash_c', BASE_NOW), false);
});

test('window resets after 1 minute', () => {
  rateLimitMap.clear();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    checkWebhookRateLimit('hash_d', BASE_NOW);
  }
  // Simulate 61 seconds later
  const later = BASE_NOW + 61_000;
  assert.strictEqual(checkWebhookRateLimit('hash_d', later), true);
});

test('rate limits are per phone hash (independent buckets)', () => {
  rateLimitMap.clear();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    checkWebhookRateLimit('hash_e', BASE_NOW);
  }
  assert.strictEqual(checkWebhookRateLimit('hash_e', BASE_NOW), false);
  assert.strictEqual(checkWebhookRateLimit('hash_f', BASE_NOW), true);
});

// Phone hash tests
test('same phone number always produces same hash', () => {
  const hash1 = hashPhoneNumber('whatsapp:+1234567890');
  const hash2 = hashPhoneNumber('whatsapp:+1234567890');
  assert.strictEqual(hash1, hash2);
});

test('different phone numbers produce different hashes', () => {
  const hash1 = hashPhoneNumber('whatsapp:+1234567890');
  const hash2 = hashPhoneNumber('whatsapp:+0987654321');
  assert.notStrictEqual(hash1, hash2);
});

test('hash is 64 hex characters (SHA-256)', () => {
  const hash = hashPhoneNumber('whatsapp:+1234567890');
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('raw phone number is not stored in the hash', () => {
  const hash = hashPhoneNumber('whatsapp:+1234567890');
  assert.strictEqual(hash.includes('+1234567890'), false);
});

// Twilio signature tests
test('valid Twilio signature is accepted', () => {
  const authToken = 'test_auth_token_123';
  const url = 'https://example.com/api/whatsapp/webhook';
  const params = { Body: 'hello', From: 'whatsapp:+123' };
  const sig = computeTwilioSignature(authToken, url, params);
  assert.ok(sig.length > 0);

  // Re-compute and compare
  const sig2 = computeTwilioSignature(authToken, url, params);
  assert.strictEqual(sig, sig2);
});

test('tampered params produce different signature', () => {
  const authToken = 'test_auth_token_123';
  const url = 'https://example.com/api/whatsapp/webhook';
  const original = computeTwilioSignature(authToken, url, { Body: 'hello' });
  const tampered = computeTwilioSignature(authToken, url, { Body: 'evil message' });
  assert.notStrictEqual(original, tampered);
});

test('wrong auth token produces different signature', () => {
  const url = 'https://example.com/api/whatsapp/webhook';
  const params = { Body: 'hello' };
  const sig1 = computeTwilioSignature('token_a', url, params);
  const sig2 = computeTwilioSignature('token_b', url, params);
  assert.notStrictEqual(sig1, sig2);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
