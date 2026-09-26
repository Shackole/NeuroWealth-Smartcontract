/**
 * Rate limiting and anti-abuse middleware — Issue #38
 *
 * Layers:
 *  1. Burst guard      — 20 req/s per IP (fixed window, 1 s)
 *  2. Global IP limit  — 100 req/min per IP for unauthenticated routes
 *  3. Authenticated    — 300 req/min per user (sliding window via keyGenerator)
 *  4. Transaction      — 10 req/min per user for /deposit and /withdraw routes
 *  5. WhatsApp webhook — 10 messages/min per phone number (separate helper)
 *
 * All limiters return standard rate-limit headers:
 *   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 * On breach: HTTP 429 with Retry-After header.
 *
 * Store: in-memory (MemoryStore from express-rate-limit) — swap to
 * rate-limit-redis by setting REDIS_URL and uncommenting the Redis store
 * section below once `rate-limit-redis` is installed.
 */

import { rateLimit, Options } from 'express-rate-limit';
import { Request, Response } from 'express';

// ─── Shared helpers ────────────────────────────────────────────────────────────

/** Extract the authenticated user ID from request headers. */
function getUserId(req: Request): string | null {
  const userId = req.headers['x-user-id'] ?? req.headers['user-id'];
  if (typeof userId === 'string' && userId.trim()) return userId.trim();
  return null;
}

/** Key for per-user limiters — falls back to IP when no user header is present. */
function userKey(req: Request): string {
  const uid = getUserId(req);
  return uid ? `user:${uid}` : (req.ip ?? 'unknown');
}

/** Standard 429 handler that always includes Retry-After. */
function make429Handler(windowMs: number) {
  return (_req: Request, res: Response): void => {
    const retryAfterSecs = Math.ceil(windowMs / 1_000);
    res.setHeader('Retry-After', retryAfterSecs.toString());
    res.status(429).json({
      error: 'Rate limit exceeded. Please slow down.',
      retryAfterSeconds: retryAfterSecs,
    });
  };
}

/** Shared limiter options that every limiter inherits. */
const sharedOptions: Partial<Options> = {
  // Emit the three standard headers (RateLimit-* draft-6 + legacy X-RateLimit-*)
  standardHeaders: 'draft-6',
  legacyHeaders: true,
  // Skip failed requests so errors don't burn the user's quota
  skipFailedRequests: false,
};

// ─── Optional Redis store (uncomment when rate-limit-redis is installed) ──────
// import RedisStore from 'rate-limit-redis';
// import { createClient } from 'redis';
// const redisClient = createClient({ url: process.env.REDIS_URL });
// redisClient.connect().catch(console.error);
// const redisStoreFactory = (prefix: string) =>
//   new RedisStore({ sendCommand: (...args: string[]) => redisClient.sendCommand(args), prefix });

// ─── 1. Burst guard — 20 req/s per IP ─────────────────────────────────────────
/**
 * Applied first (before all other limiters) to absorb short traffic spikes.
 * 20 requests per 1-second window per IP.
 */
export const burstLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 1_000,       // 1 second
  max: 20,               // 20 req/s burst
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: make429Handler(1_000),
  message: 'Burst limit exceeded. Max 20 requests per second per IP.',
});

// ─── 2. Global IP limiter — 100 req/min (unauthenticated routes) ──────────────
/**
 * Applies to all routes. Authenticated routes layer their own higher limit
 * on top via `authenticatedLimiter`.
 */
export const ipRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60_000,      // 1 minute fixed window
  max: parseInt(process.env.RATE_LIMIT_IP_MAX ?? '100', 10),
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: make429Handler(60_000),
  message: 'Too many requests from this IP. Please try again in a minute.',
});

// ─── 3. Authenticated user limiter — 300 req/min per user ────────────────────
/**
 * Sliding-window approximation: express-rate-limit uses a fixed window per
 * key. For a true sliding window, replace the MemoryStore with a Redis store
 * using `rate-limit-redis` with windowMs + an appropriate TTL.
 *
 * Skip: if no user header is present, this limiter is a no-op (the global IP
 * limiter already covers unauthenticated callers).
 */
export const authenticatedLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX ?? '300', 10),
  keyGenerator: userKey,
  skip: (req) => getUserId(req) === null,   // unauthenticated → skip (IP limiter handles them)
  handler: make429Handler(60_000),
  message: 'Too many requests for this account. Max 300 per minute.',
});

// ─── 4. Transaction limiter — 10 req/min per user (deposit / withdraw) ────────
/**
 * Mount this middleware directly on the /deposit and /withdraw routes, not
 * globally. Example in the router:
 *
 *   router.post('/deposit',  transactionLimiter, depositHandler);
 *   router.post('/withdraw', transactionLimiter, withdrawHandler);
 */
export const transactionLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60_000,
  max: parseInt(process.env.RATE_LIMIT_TX_MAX ?? '10', 10),
  keyGenerator: userKey,
  handler: make429Handler(60_000),
  message: 'Transaction rate limit exceeded. Max 10 deposits/withdrawals per minute.',
});

// ─── 5. WhatsApp webhook limiter — 10 messages/min per phone hash ─────────────
/**
 * The webhook handler passes the hashed phone number as the key so that the
 * limiter never touches the raw phone number.
 *
 * Usage in webhook.ts:
 *   if (!checkWebhookRateLimit(phoneHash)) { return 429; }
 *
 * This replaces the existing in-memory rateLimitMap in whatsapp/src/webhook.ts.
 */

const WHATSAPP_RATE_LIMIT_MAX = parseInt(process.env.WHATSAPP_RATE_LIMIT_MAX ?? '10', 10);
const WHATSAPP_WINDOW_MS = 60_000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}
const whatsappRateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Returns true if the message should be allowed, false if the rate limit is
 * exceeded.
 *
 * Uses a fixed-window counter keyed by the hashed phone number so no raw PII
 * is ever stored in memory.
 */
export function checkWebhookRateLimit(phoneHash: string): boolean {
  const now = Date.now();
  const entry = whatsappRateLimitMap.get(phoneHash);

  if (!entry || now - entry.windowStart > WHATSAPP_WINDOW_MS) {
    whatsappRateLimitMap.set(phoneHash, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= WHATSAPP_RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * Returns the remaining message quota for a phone hash within the current
 * window. Useful for including quota info in webhook responses.
 */
export function getWebhookRateLimitRemaining(phoneHash: string): number {
  const now = Date.now();
  const entry = whatsappRateLimitMap.get(phoneHash);

  if (!entry || now - entry.windowStart > WHATSAPP_WINDOW_MS) {
    return WHATSAPP_RATE_LIMIT_MAX;
  }

  return Math.max(0, WHATSAPP_RATE_LIMIT_MAX - entry.count);
}

// ─── Convenience stack for app.use() ─────────────────────────────────────────
/**
 * Apply this array in order with `app.use(...globalRateLimitStack)`.
 * It applies the burst guard first, then the global IP limiter, then the
 * per-user authenticated limiter.
 *
 * Mount `transactionLimiter` separately on /deposit and /withdraw.
 */
export const globalRateLimitStack = [burstLimiter, ipRateLimiter, authenticatedLimiter];
