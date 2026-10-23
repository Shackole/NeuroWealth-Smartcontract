/**
 * OTP Phone Verification Service (#29)
 *
 * Handles OTP generation, delivery via Twilio SMS, and verification for
 * WhatsApp onboarding.
 *
 * Security properties:
 *  - OTP stored as bcrypt hash in Redis (never plaintext)
 *  - TTL: 600 s (10 minutes)
 *  - Max 3 failed attempts → 30-minute lockout (stored in Redis)
 *  - Re-verification required after 90 days of inactivity
 *  - On success: user marked verified in DB + Stellar keypair generated
 *  - Private key encrypted at rest with AES-256-GCM before DB storage
 *  - Single-use consumption via atomic compare-and-delete (Lua) so parallel
 *    verifications across instances cannot consume the same code twice
 *  - Resend cooldown enforced in Redis to bound OTP issuance
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';
import logger from './logger';
import { registerRedisClient } from './redisClients';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const OTP_TTL_S = 600;             // 10 minutes
const MAX_ATTEMPTS = 3;
const LOCKOUT_TTL_S = 30 * 60;    // 30 minutes
const RESEND_COOLDOWN_S = 60;     // minimum seconds between OTP resends
const REVERIFY_DAYS = 90;
const BCRYPT_ROUNDS = 10;

// AES-256-GCM key — must be exactly 32 bytes (256 bits), base64-encoded in env
const ENCRYPTION_KEY_B64 =
  process.env.KEYPAIR_ENCRYPTION_KEY ||
  Buffer.from(crypto.randomBytes(32)).toString('base64'); // fallback only — set in prod!

const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_B64, 'base64');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Key prefixes
const OTP_PREFIX = 'otp:hash:';
const LOCKOUT_PREFIX = 'otp:lockout:';
const ATTEMPT_PREFIX = 'otp:attempts:';
const COOLDOWN_PREFIX = 'otp:cooldown:';
const VERIFIED_PREFIX = 'user:verified:';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OTPGenerateResult {
  code: string;   // Returned to caller for delivery — NOT stored in plaintext
  expiresInSeconds: number;
}

export interface OTPVerifyResult {
  success: boolean;
  message: string;
  lockedUntil?: Date;
}

export interface WalletCreateResult {
  publicKey: string;
  encryptedPrivateKey: string;  // AES-256-GCM ciphertext, base64
  iv: string;                   // base64
  authTag: string;              // base64
}

// ─────────────────────────────────────────────────────────────────────────────
// Redis client
// ─────────────────────────────────────────────────────────────────────────────

export function createOTPRedisClient(): IORedis {
  const client = registerRedisClient(new IORedis(REDIS_URL, { lazyConnect: true }));
  client.on('error', (err) =>
    logger.error({ error: err.message }, 'Redis error (OTP service)'),
  );
  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic single-use consumption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically delete the stored OTP hash only if it still matches the value we
 * just verified. This is a compare-and-delete (CAS) so that two concurrent
 * verifications of the same code cannot both succeed: the first DEL wins, the
 * second sees the key gone and returns 0.
 *
 * Returns true when this caller consumed the code, false otherwise.
 */
const CONSUME_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

async function consumeOTP(
  redis: IORedis,
  phoneHash: string,
  storedHash: string,
): Promise<boolean> {
  const result = await redis.eval(
    CONSUME_SCRIPT,
    1,
    `${OTP_PREFIX}${phoneHash}`,
    storedHash,
  );
  return Number(result) === 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns IV, ciphertext, and auth tag as separate base64 strings so they can
 * be stored in individual database columns.
 */
export function encryptSecret(plaintext: string): {
  iv: string;
  ciphertext: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(12); // 96-bit nonce for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/**
 * Decrypt a ciphertext produced by `encryptSecret`.
 */
export function decryptSecret(
  ciphertextB64: string,
  ivB64: string,
  authTagB64: string,
): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a 6-digit OTP for a phone hash and store its bcrypt hash in Redis.
 * Returns the plaintext code for delivery to the user (caller must not log it).
 *
 * Enforces a resend cooldown so a caller cannot spam OTP issuance. The cooldown
 * key is set atomically with SET NX so concurrent resends across instances are
 * bounded to one per window.
 */
export async function generateOTP(
  redis: IORedis,
  phoneHash: string,
): Promise<OTPGenerateResult> {
  // Check if user is locked out
  const lockout = await redis.get(`${LOCKOUT_PREFIX}${phoneHash}`);
  if (lockout) {
    const ttl = await redis.ttl(`${LOCKOUT_PREFIX}${phoneHash}`);
    const lockedUntil = new Date(Date.now() + ttl * 1000);
    throw new OTPLockedError(lockedUntil);
  }

  // Resend cooldown — SET NX is atomic across instances.
  const cooldownKey = `${COOLDOWN_PREFIX}${phoneHash}`;
  const acquired = await redis.set(
    cooldownKey,
    '1',
    'EX',
    RESEND_COOLDOWN_S,
    'NX',
  );
  if (acquired !== 'OK') {
    const ttl = await redis.ttl(cooldownKey);
    const retryAfter = ttl > 0 ? ttl : RESEND_COOLDOWN_S;
    throw new OTPCooldownError(retryAfter);
  }

  const code = crypto.randomInt(100_000, 999_999).toString();
  const hash = await bcrypt.hash(code, BCRYPT_ROUNDS);

  // Reset attempt counter and store new hash
  await redis.pipeline()
    .set(`${OTP_PREFIX}${phoneHash}`, hash, 'EX', OTP_TTL_S)
    .del(`${ATTEMPT_PREFIX}${phoneHash}`)
    .exec();

  logger.info({ phoneHash: phoneHash.substring(0, 8) + '…' }, 'OTP generated');
  return { code, expiresInSeconds: OTP_TTL_S };
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a 6-digit OTP submission.
 * Enforces attempt limits and lockout periods, and consumes the code exactly
 * once even under concurrent verification.
 */
export async function verifyOTP(
  redis: IORedis,
  phoneHash: string,
  inputCode: string,
): Promise<OTPVerifyResult> {
  // Lockout check
  const lockout = await redis.get(`${LOCKOUT_PREFIX}${phoneHash}`);
  if (lockout) {
    const ttl = await redis.ttl(`${LOCKOUT_PREFIX}${phoneHash}`);
    const lockedUntil = new Date(Date.now() + ttl * 1000);
    return {
      success: false,
      message: `Too many failed attempts. Try again after ${lockedUntil.toUTCString()}.`,
      lockedUntil,
    };
  }

  // Fetch stored hash
  const storedHash = await redis.get(`${OTP_PREFIX}${phoneHash}`);
  if (!storedHash) {
    return {
      success: false,
      message: 'OTP expired or not found. Please request a new code.',
    };
  }

  // Constant-time comparison via bcrypt
  const match = await bcrypt.compare(inputCode.trim(), storedHash);

  if (!match) {
    // Increment attempt counter
    const attempts = await redis
      .pipeline()
      .incr(`${ATTEMPT_PREFIX}${phoneHash}`)
      .expire(`${ATTEMPT_PREFIX}${phoneHash}`, OTP_TTL_S)
      .exec();

    const attemptCount = (attempts?.[0]?.[1] as number) ?? 1;
    const remaining = MAX_ATTEMPTS - attemptCount;

    if (remaining <= 0) {
      // Lock out the user
      await redis.pipeline()
        .del(`${OTP_PREFIX}${phoneHash}`)
        .del(`${ATTEMPT_PREFIX}${phoneHash}`)
        .set(`${LOCKOUT_PREFIX}${phoneHash}`, '1', 'EX', LOCKOUT_TTL_S)
        .exec();

      const lockedUntil = new Date(Date.now() + LOCKOUT_TTL_S * 1000);
      return {
        success: false,
        message: `Locked out after ${MAX_ATTEMPTS} failed attempts. Try again at ${lockedUntil.toUTCString()}.`,
        lockedUntil,
      };
    }

    return {
      success: false,
      message: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  // Success — atomically consume the code (single-use, CAS). If another
  // concurrent verification already consumed it, this caller must fail.
  const consumed = await consumeOTP(redis, phoneHash, storedHash);
  if (!consumed) {
    return {
      success: false,
      message: 'OTP expired or already used. Please request a new code.',
    };
  }

  await redis.del(`${ATTEMPT_PREFIX}${phoneHash}`);

  logger.info({ phoneHash: phoneHash.substring(0, 8) + '…' }, 'OTP verified successfully');
  return { success: true, message: 'OTP verified successfully.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Twilio SMS delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send the OTP to a phone number via Twilio SMS.
 * Does NOT log the OTP code itself.
 */
export async function sendOTPViaTwilio(
  toNumber: 

/* … truncated 5175 chars — edit only what you need near the top … */
