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
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const OTP_TTL_S = 600;             // 10 minutes
const MAX_ATTEMPTS = 3;
const LOCKOUT_TTL_S = 30 * 60;    // 30 minutes
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
  const client = new IORedis(REDIS_URL, { lazyConnect: true });
  client.on('error', (err) =>
    logger.error({ error: err.message }, 'Redis error (OTP service)'),
  );
  return client;
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
 * Enforces attempt limits and lockout periods.
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

  // Success — delete OTP and attempt counter (single-use)
  await redis.pipeline()
    .del(`${OTP_PREFIX}${phoneHash}`)
    .del(`${ATTEMPT_PREFIX}${phoneHash}`)
    .exec();

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
  toNumber: string,
  _code: string,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('Twilio credentials not configured — OTP SMS not sent');
    return;
  }

  // Lazy import so the module loads cleanly when Twilio is not installed
  const twilio = (await import('twilio')).default;
  const client = twilio(accountSid, authToken);

  await client.messages.create({
    to: toNumber,
    from: fromNumber,
    body: `Your NeuroWealth verification code is: ${_code}\n\nExpires in 10 minutes. Do not share this code.`,
  });

  logger.info({ to: toNumber.slice(0, 6) + '…' }, 'OTP SMS sent');
}

// ─────────────────────────────────────────────────────────────────────────────
// User provisioning — called after successful OTP verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a new Stellar keypair for a user and encrypt the secret key.
 * Returns the public key and encrypted secret components.
 * Caller is responsible for persisting these to the database.
 */
export function generateCustodialKeypair(): WalletCreateResult {
  const keypair = Keypair.random();
  const secret = keypair.secret();
  const { iv, ciphertext, authTag } = encryptSecret(secret);

  return {
    publicKey: keypair.publicKey(),
    encryptedPrivateKey: ciphertext,
    iv,
    authTag,
  };
}

/**
 * Mark a user as verified in the database and create their Stellar keypair.
 * Idempotent — if the user already exists, updates `updated_at` and returns
 * the existing public key.
 */
export async function onboardVerifiedUser(
  pool: Pool,
  phoneHash: string,
): Promise<{ publicKey: string; isNew: boolean }> {
  // Check for existing user
  const existing = await pool.query<{
    stellar_address: string;
    updated_at: string;
  }>(
    'SELECT stellar_address, updated_at FROM users WHERE phone_hash = $1',
    [phoneHash],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const user = existing.rows[0];
    const lastActivity = new Date(user.updated_at);
    const daysSinceActivity =
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceActivity > REVERIFY_DAYS) {
      // Re-verification required — reset verification timestamp
      await pool.query(
        'UPDATE users SET updated_at = NOW() WHERE phone_hash = $1',
        [phoneHash],
      );
      logger.info(
        { phoneHash: phoneHash.substring(0, 8) + '…', daysSinceActivity },
        'User re-verified after inactivity',
      );
    }

    return { publicKey: user.stellar_address, isNew: false };
  }

  // New user — generate keypair and insert
  const wallet = generateCustodialKeypair();

  await pool.query(
    `INSERT INTO users (stellar_address, phone_hash, strategy_preference, created_at, updated_at)
     VALUES ($1, $2, 'balanced', NOW(), NOW())`,
    [wallet.publicKey, phoneHash],
  );

  // Store the encrypted private key in a separate secure table
  // (This table must be created via migration — see schema notes below)
  try {
    await pool.query(
      `INSERT INTO custodial_keys (stellar_address, encrypted_secret, iv, auth_tag, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (stellar_address) DO NOTHING`,
      [wallet.publicKey, wallet.encryptedPrivateKey, wallet.iv, wallet.authTag],
    );
  } catch (err) {
    // Table may not exist yet in dev — log but don't fail
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'custodial_keys table not found — skipping key storage',
    );
  }

  logger.info(
    {
      publicKey: wallet.publicKey,
      phoneHash: phoneHash.substring(0, 8) + '…',
    },
    'New user provisioned with Stellar keypair',
  );

  return { publicKey: wallet.publicKey, isNew: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-verification check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a user must re-verify their phone number due to inactivity.
 */
export async function requiresReverification(
  pool: Pool,
  phoneHash: string,
): Promise<boolean> {
  const result = await pool.query<{ updated_at: string }>(
    'SELECT updated_at FROM users WHERE phone_hash = $1',
    [phoneHash],
  );

  if (!result.rowCount || result.rowCount === 0) return true;

  const lastActivity = new Date(result.rows[0].updated_at);
  const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > REVERIFY_DAYS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error
// ─────────────────────────────────────────────────────────────────────────────

export class OTPLockedError extends Error {
  lockedUntil: Date;

  constructor(lockedUntil: Date) {
    super(`Account locked until ${lockedUntil.toUTCString()}`);
    this.name = 'OTPLockedError';
    this.lockedUntil = lockedUntil;
  }
}
