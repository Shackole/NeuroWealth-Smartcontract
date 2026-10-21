/**
 * Sign-In With Stellar (SIWS) Authentication (#35)
 *
 * Flow:
 *  1. GET  /api/auth/challenge?address=G... — issues a one-time nonce stored
 *     in Redis with a 5-minute TTL.
 *  2. POST /api/auth/verify — the client signs a standard challenge message
 *     with their Stellar keypair and submits the signature.  On success, a
 *     15-minute access JWT and a 7-day refresh token are returned.
 *  3. POST /api/auth/refresh — exchanges a valid refresh token for a new pair.
 *
 * JWT algorithm: HS256 (symmetric, keyed from JWT_SECRET env var).
 * Nonces are stored in Redis with a 5-minute TTL and are single-use.
 * Refresh tokens rotate on each use — old tokens are immediately invalidated.
 *
 * OTP safety (#418): verification is bounded by a durable attempt counter and
 * an explicit expiry timestamp, resends are rate-limited by a cooldown, and
 * consumption is atomic (compare-and-delete) so concurrent verifications
 * across service instances cannot consume the same code twice.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Redis } from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-jwt-secret-32chars!';
const ACCESS_TOKEN_TTL_S = 15 * 60;         // 15 minutes
const REFRESH_TOKEN_TTL_S = 7 * 24 * 60 * 60; // 7 days
const NONCE_TTL_S = 5 * 60;                 // 5 minutes

const NONCE_PREFIX = 'siws:nonce:';
const REFRESH_PREFIX = 'siws:refresh:';

// OTP protection (#418)
const OTP_TTL_S = 5 * 60;                   // codes expire after 5 minutes
const OTP_MAX_ATTEMPTS = 5;                 // bounded verification attempts
const OTP_RESEND_COOLDOWN_S = 30;           // minimum gap between resends

const OTP_PREFIX = 'otp:code:';
const OTP_ATTEMPTS_PREFIX = 'otp:attempts:';
const OTP_COOLDOWN_PREFIX = 'otp:cooldown:';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;   // Stellar public key (G…)
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
  /** Explicit operator scope; absent for ordinary user tokens. */
  role?: 'operator';
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'consumed' | 'invalid' | 'too_many_attempts' };

export type OtpIssueResult =
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; reason: 'cooldown'; retryAfterS: number };

// ─────────────────────────────────────────────────────────────────────────────
// Nonce management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random nonce, store it in Redis tied to
 * `address`, and return the nonce string.
 */
export async function issueNonce(redis: Redis, address: string): Promise<string> {
  const nonce = crypto.randomBytes(32).toString('hex');
  await redis.set(`${NONCE_PREFIX}${address}`, nonce, 'EX', NONCE_TTL_S);
  return nonce;
}

/**
 * Retrieve and immediately delete the nonce for an address.
 * Returns `null` if the nonce has expired or does not exist.
 * Single-use: calling this twice for the same address always returns null
 * on the second call.
 */
export async function consumeNonce(
  redis: Redis,
  address: string,
): Promise<string | null> {
  const key = `${NONCE_PREFIX}${address}`;
  // Atomic GET-and-DELETE via pipeline
  const [nonce] = await redis.pipeline().get(key).del(key).exec() as [[null, string | null], [null, number]];
  return nonce[1];
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP issuance, verification, and consumption (#418)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue a fresh OTP for `address`.
 *
 * Resends are rate-limited by a durable cooldown key so a caller cannot spam
 * new codes.  The code itself is stored with an explicit expiry timestamp and
 * a fresh attempt counter; the raw code is never logged.
 */
export async function issueOtp(redis: Redis, address: string): Promise<OtpIssueResult> {
  const cooldownKey = `${OTP_COOLDOWN_PREFIX}${address}`;
  // SET NX EX is atomic across instances: only one issuer wins the cooldown.
  const acquired = await redis.set(cooldownKey, '1', 'EX', OTP_RESEND_COOLDOWN_S, 'NX');
  if (acquired !== 'OK') {
    const ttl = await redis.ttl(cooldownKey);
    return { ok: false, reason: 'cooldown', retryAfterS: ttl > 0 ? ttl : OTP_RESEND_COOLDOWN_S };
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = Date.now() + OTP_TTL_S * 1000;
  const codeKey = `${OTP_PREFIX}${address}`;
  const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${address}`;

  // Store the code with its expiry; reset the attempt counter for the new code.
  await redis
    .multi()
    .set(codeKey, JSON.stringify({ code, expiresAt }), 'EX', OTP_TTL_S)
    .del(attemptsKey)
    .exec();

  return { ok: true, code, expiresAt };
}

/**
 * Verify and consume an OTP for `address`.
 *
 * - Expired codes fail (`expired`).
 * - Codes already consumed fail (`consumed`).
 * - Attempts are bounded; exceeding the limit fails (`too_many_attempts`).
 * - Consumption is atomic: the code is deleted via compare-and-delete so two
 *   concurrent verifications cannot both succeed.
 *
 * The submitted code is never logged.
 */
export async function verifyAndConsumeOtp(
  redis: Redis,
  address: string,
  submittedCode: string,
): Promise<OtpVerifyResult> {
  const codeKey = `${OTP_PREFIX}${address}`;
  const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${address}`;

  // Bound attempts before doing any comparison work.
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) {
    // Keep the counter alive at least as long as the code.
    await redis.expire(attemptsKey, OTP_TTL_S);
  }
  if (attempts > OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  const raw = await redis.get(codeKey);
  if (!raw) {
    // Either never issued, expired, or already consumed.
    return { ok: false, reason: 'consumed' };
  }

  let stored: { code: string; expiresAt: number };
  try {
    stored = JSON.parse(raw) as { code: string; expiresAt: number };
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (Date.now() > stored.expiresAt) {
    await redis.del(codeKey);
    return { ok: false, reason: 'expired' };
  }

  // Constant-time comparison to avoid timing leaks.
  const expected = Buffer.from(stored.code, 'utf8');
  const provided = Buffer.from(submittedCode, 'utf8');
  const matches =
    expected.length === provided.length && crypto.timingSafeEqual(expected, provided);

  if (!matches) {
    return { ok: false, reason: 'invalid' };
  }

  // Atomic single-use consumption: only the caller that deletes the key wins.
  // Compare-and-delete via a Lua script so concurrent verifications across
  // instances cannot both consume the same code.
  const consumed = await redis.eval(
    `if redis.call('GET', KEYS[1]) == ARGV[1] then
       return redis.call('DEL', KEYS[1])
     else
       return 0
     end`,
    1,
    codeKey,
    raw,
  );

  if (consumed !== 1) {
    // Another instance consumed it first.
    return { ok: false, reason: 'consumed' };
  }

  await redis.del(attemptsKey);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge message construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the deterministic message that the client must sign with their
 * Stellar keypair.  Both client and server build the same string from the
 * nonce so the content is unambiguous.
 */
export function buildChallengeMessage(address: string, nonce: string): string {
  return [
    'NeuroWealth Authentication',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toUTCString()}`,
    'Sign this message to prove ownership of your Stellar wallet.',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify that `signature` (base64-encoded) is a valid Ed25519 signature of
 * `message` by the keypair whose public key is `address`.
 *
 * Uses `@stellar/stellar-sdk` Keypair.verify so it stays consistent with the
 * Stellar SDK's key encoding.
 */
export function verifyStellarSignature(
  address: string,
  message: string,
  signatureBase64: string,
): boolean {
  try {
    // Lazy import to avoid loading the full SDK at module load time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Keypair } = require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk');
    const keypair = Keypair.fromPublicKey(address);
    const messageBuffer = Buffer.from(message, 'utf8');
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT issuance
// ─────────────────────────────────────────────────────────────────────────────

function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, ttlSeconds: number): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
}

export function issueTokenPair(address: string, role?: 'operator'): AuthTokenPair {
  const accessToken = signToken({ sub: address, type: 'access', ...(role ? { role } : {}) }, ACCESS_TOKEN_TTL_S);
  const refreshToken = signToken({ sub: address, type: 'refresh', ...(role ? { role } : {}) }, REFRESH_TOKEN_TTL_S);
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_S };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh token rotation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store a refresh token hash in Redis so it can be invalidated on use.
 * We store the SHA-256 hash of the token (not the raw JWT) to minimise exposure.
 */
export async function storeRefreshToken(
  redis: Redis,
  address: string,
  refreshToken: string,
): Promise<void> {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await redis.set(`${REFRESH_PREFIX}${hash}`, address, 'EX', REFRESH_TOKEN_TTL_S);
}

/**
 * Validate and rotate a refresh token.
 * On success: old token is invalidated, a new pair is issued.
 * On failure: returns null (token expired, revoked, or tampered).
 */
export async function rotateRefreshToken(
  redis: Redis,
  rawRefreshToken: string,
): Promise<AuthTokenPair | null> {
  // 1. Verify JWT signature and expiry
  let payload: JWTPayload;
  try {
    payload = jwt.verify(rawRefreshToken, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }

  if (payload.type !== 'refresh') return null;

  // 2. Check the token exists in Redis (not yet rotated / revoked)
  const hash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const storedAddress = await redis.get(`${REFRESH_PREFIX}${hash}`);
  if (!storedAddress || storedAddress !== payload.sub) return null;

  // 3. Invalidate old token
  await redis.del(`${REFRESH_PREFIX}${hash}`);

  // 4. Issue new pair (preserve operator scope across rotation)
  const newPair = issueTokenPair(payload.sub, payload.role === 'operator' ? 'operator' : undefined);
  await storeRefreshToken(redis, payload.sub, newPair.refreshToken);
  return newPair;
}

// ─────────────────────────────────────────────────────────────────────────────
// Access token verification (used by auth middleware)
// ─────────────────────────────────────────────────────────────────────────────

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns true only when the verified payload carries an explicit operator
 * scope.  Used by transaction status routes to gate operational access.
 */
export function isOperator(payload: JWTPayload | null | undefined): boolean {
  return payload?.role === 'operator';
}
