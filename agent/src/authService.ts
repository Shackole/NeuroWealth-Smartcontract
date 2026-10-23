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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;   // Stellar public key (G…)
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * A server-issued, single-use challenge.  The exact `message` is persisted so
 * the server verifies the signature against the same bytes it handed out
 * (including the issued-at timestamp), preventing message-mutation attacks.
 */
export interface Challenge {
  address: string;
  nonce: string;
  message: string;
  issuedAt: number; // epoch ms
}

// ─────────────────────────────────────────────────────────────────────────────
// Nonce / challenge management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random nonce, store the full challenge in
 * Redis tied to `address`, and return the challenge the client must sign.
 */
export async function issueNonce(redis: Redis, address: string): Promise<string> {
  const challenge = await issueChallenge(redis, address);
  return challenge.nonce;
}

/**
 * Issue a single-use challenge for `address`.  The challenge (nonce + exact
 * message) is stored in Redis with a 5-minute TTL.  Issuing a new challenge
 * for the same address replaces any previous one.
 */
export async function issueChallenge(redis: Redis, address: string): Promise<Challenge> {
  const nonce = crypto.randomBytes(32).toString('hex');
  const issuedAt = Date.now();
  const message = buildChallengeMessage(address, nonce, issuedAt);
  const challenge: Challenge = { address, nonce, message, issuedAt };
  await redis.set(
    `${NONCE_PREFIX}${address}`,
    JSON.stringify(challenge),
    'EX',
    NONCE_TTL_S,
  );
  return challenge;
}

/**
 * Retrieve and immediately delete the challenge for an address.
 * Returns `null` if the challenge has expired or does not exist.
 * Single-use: calling this twice for the same address always returns null
 * on the second call.
 */
export async function consumeNonce(
  redis: Redis,
  address: string,
): Promise<string | null> {
  const challenge = await consumeChallenge(redis, address);
  return challenge ? challenge.nonce : null;
}

/**
 * Atomically fetch-and-delete the stored challenge for `address`.
 * Returns `null` when the challenge is missing, expired, or already consumed.
 */
export async function consumeChallenge(
  redis: Redis,
  address: string,
): Promise<Challenge | null> {
  const key = `${NONCE_PREFIX}${address}`;
  // Atomic GET-and-DELETE via pipeline
  const [nonce] = await redis.pipeline().get(key).del(key).exec() as [[null, string | null], [null, number]];
  const raw = nonce[1];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Challenge;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge message construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the deterministic message that the client must sign with their
 * Stellar keypair.  Both client and server build the same string from the
 * nonce and issued-at timestamp so the content is unambiguous.
 */
export function buildChallengeMessage(
  address: string,
  nonce: string,
  issuedAt: number = Date.now(),
): string {
  return [
    'NeuroWealth Authentication',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issuedAt).toUTCString()}`,
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

/**
 * Full wallet-proof verification: consume the single-use challenge for
 * `address`, confirm it has not expired, and verify the Ed25519 signature
 * over the exact stored message.  Returns the verified address on success,
 * or `null` on any failure (missing/expired/replayed challenge, bad sig).
 */
export async function verifyChallenge(
  redis: Redis,
  address: string,
  signatureBase64: string,
): Promise<string | null> {
  const challenge = await consumeChallenge(redis, address);
  if (!challenge) return null;

  // Defence-in-depth: reject challenges past their TTL even if Redis has not
  // yet evicted the key.
  if (Date.now() - challenge.issuedAt > NONCE_TTL_S * 1000) return null;

  if (!verifyStellarSignature(challenge.address, challenge.message, signatureBase64)) {
    return null;
  }

  return challenge.address;
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT issuance
// ─────────────────────────────────────────────────────────────────────────────

function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, ttlSeconds: number): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSeconds });
}

export function issueTokenPair(address: string): AuthTokenPair {
  const accessToken = signToken({ sub: address, type: 'access' }, ACCESS_TOKEN_TTL_S);
  const refreshToken = signToken({ sub: address, type: 'refresh' }, REFRESH_TOKEN_TTL_S);
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

  // 4. Issue new pair
  const newPair = issueTokenPair(payload.sub);
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
