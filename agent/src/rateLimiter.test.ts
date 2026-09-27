/**
 * Rate limiter tests — Issue #38
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  burstLimiter,
  ipRateLimiter,
  authenticatedLimiter,
  transactionLimiter,
  globalRateLimitStack,
  checkWebhookRateLimit,
  getWebhookRateLimitRemaining,
} from './rateLimiter';

describe('Rate Limiter (#38)', () => {
  it('exports burstLimiter middleware', () => {
    assert.strictEqual(typeof burstLimiter, 'function');
  });

  it('exports ipRateLimiter middleware', () => {
    assert.strictEqual(typeof ipRateLimiter, 'function');
  });

  it('exports authenticatedLimiter middleware', () => {
    assert.strictEqual(typeof authenticatedLimiter, 'function');
  });

  it('exports transactionLimiter middleware', () => {
    assert.strictEqual(typeof transactionLimiter, 'function');
  });

  it('globalRateLimitStack contains 3 middleware functions', () => {
    assert.strictEqual(Array.isArray(globalRateLimitStack), true);
    assert.strictEqual(globalRateLimitStack.length, 3);
    for (const mw of globalRateLimitStack) {
      assert.strictEqual(typeof mw, 'function');
    }
  });

  describe('checkWebhookRateLimit', () => {
    it('allows messages within the limit', () => {
      const phone = `test-phone-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(checkWebhookRateLimit(phone), true, `message ${i + 1} should be allowed`);
      }
    });

    it('blocks messages over the limit', () => {
      const phone = `test-phone-over-${Date.now()}`;
      for (let i = 0; i < 10; i++) {
        checkWebhookRateLimit(phone);
      }
      assert.strictEqual(checkWebhookRateLimit(phone), false, '11th message should be blocked');
    });

    it('different phone hashes have independent windows', () => {
      const phone1 = `phone-a-${Date.now()}`;
      const phone2 = `phone-b-${Date.now()}`;
      for (let i = 0; i < 10; i++) checkWebhookRateLimit(phone1);
      // phone1 is exhausted but phone2 should still be allowed
      assert.strictEqual(checkWebhookRateLimit(phone2), true);
    });
  });

  describe('getWebhookRateLimitRemaining', () => {
    it('returns full quota for a new phone hash', () => {
      const phone = `new-phone-${Date.now()}`;
      assert.strictEqual(getWebhookRateLimitRemaining(phone), 10);
    });

    it('decreases after each message', () => {
      const phone = `decrement-${Date.now()}`;
      checkWebhookRateLimit(phone);
      checkWebhookRateLimit(phone);
      assert.strictEqual(getWebhookRateLimitRemaining(phone), 8);
    });

    it('returns 0 when exhausted', () => {
      const phone = `exhausted-${Date.now()}`;
      for (let i = 0; i < 10; i++) checkWebhookRateLimit(phone);
      assert.strictEqual(getWebhookRateLimitRemaining(phone), 0);
    });
  });
});
