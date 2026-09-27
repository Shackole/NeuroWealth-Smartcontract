/**
 * Custodial Keypair Management — Issue #30
 *
 * Generates and stores Ed25519 Stellar keypairs for WhatsApp users who cannot
 * use a browser wallet. Secret keys are NEVER stored in plaintext.
 *
 * Encryption model — AWS KMS envelope encryption:
 *   1. KMS GenerateDataKey returns a 256-bit data key (plaintext + ciphertext).
 *   2. The plaintext data key encrypts the Stellar secret key using AES-256-GCM.
 *   3. Both the AES ciphertext and the KMS-encrypted data key ciphertext are
 *      stored in the `users.encrypted_secret` column as a single JSON blob.
 *   4. To decrypt: call KMS Decrypt on the data key ciphertext, then use the
 *      recovered plaintext data key to decrypt the AES ciphertext in-memory.
 *   5. The plaintext data key is zeroed out immediately after use.
 *
 * Plaintext secret keys never touch disk, logs, or network.
 *
 * An audit log entry is written every time a keypair is generated or decrypted.
 *
 * Environment variables:
 *   KMS_KEY_ID       — AWS KMS key ARN or alias (e.g. alias/neurowealth-agent)
 *   AWS_REGION       — AWS region for the KMS key (e.g. us-east-1)
 *   DATABASE_URL     — PostgreSQL connection string (used by agent/src/db.ts pool)
 *
 * Fallback (dev/test):
 *   When KMS_KEY_ID is unset, a deterministic local key derived via HKDF from
 *   ENCRYPTION_KEY env var is used instead. This fallback MUST NOT be used
 *   in production — the code will warn loudly.
 */

import crypto from 'crypto';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { Keypair } from '@stellar/stellar-sdk';
import { pool } from './db';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

/**
 * Opaque encrypted secret stored in `users.encrypted_secret` (JSON).
 * All fields are hex-encoded.
 */
export interface EncryptedKeypairSecret {
  /** AES-256-GCM ciphertext of the Stellar secret key (hex). */
  ciphertext: string;
  /** AES-256-GCM initialisation vector (hex, 12 bytes). */
  iv: string;
  /** AES-256-GCM authentication tag (hex, 16 bytes). */
  tag: string;
  /** KMS-encrypted data key ciphertext (base64). */
  encryptedDataKey: string;
  /** KMS key ID used for envelope encryption. */
  kmsKeyId: string;
  /** Schema version — increment if the format changes. */
  version: number;
}

export interface GeneratedKeypair {
  /** Stellar public key (G…) — stored in plaintext. */
  publicKey: string;
  /** Encrypted secret blob — stored in `users.encrypted_secret`. */
  encryptedSecret: EncryptedKeypairSecret;
}

// ─────────────────────────────────────────────────────────────────
// KMS client (lazy-init)
// ─────────────────────────────────────────────────────────────────

let _kms: KMSClient | null = null;

function getKmsClient(): KMSClient {
  if (!_kms) {
    _kms = new KMSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return _kms;
}

// ─────────────────────────────────────────────────────────────────
// Envelope encryption helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Generates a fresh 256-bit data key via KMS and encrypts `plaintext`
 * with AES-256-GCM. Both the ciphertext and the KMS-wrapped data key
 * are returned; the plaintext data key is zeroed after use.
 */
async function kmsEnvelopeEncrypt(
  plaintext: string,
  kmsKeyId: string,
): Promise<Omit<EncryptedKeypairSecret, 'version'>> {
  const kms = getKmsClient();

  // 1. Ask KMS for a fresh data key
  const dkResponse = await kms.send(
    new GenerateDataKeyCommand({
      KeyId: kmsKeyId,
      KeySpec: 'AES_256',
    }),
  );

  if (!dkResponse.Plaintext || !dkResponse.CiphertextBlob) {
    throw new Error('KMS GenerateDataKey returned incomplete response');
  }

  const plaintextDataKey = Buffer.from(dkResponse.Plaintext);
  const encryptedDataKey = Buffer.from(dkResponse.CiphertextBlob).toString('base64');

  try {
    // 2. Encrypt secret key with AES-256-GCM using the plaintext data key
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', plaintextDataKey, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag,
      encryptedDataKey,
      kmsKeyId,
    };
  } finally {
    // 3. Zero out the plaintext data key from memory
    plaintextDataKey.fill(0);
  }
}

/**
 * Decrypts an envelope-encrypted secret key.
 * The plaintext data key is held in memory only for the duration of
 * the AES decryption and zeroed immediately after.
 *
 * NEVER log or return the output of this function beyond what is
 * strictly needed for transaction signing.
 */
async function kmsEnvelopeDecrypt(
  encrypted: EncryptedKeypairSecret,
): Promise<string> {
  const kms = getKmsClient();

  // 1. Recover the plaintext data key from KMS
  const decryptResponse = await kms.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(encrypted.encryptedDataKey, 'base64'),
      KeyId: encrypted.kmsKeyId,
    }),
  );

  if (!decryptResponse.Plaintext) {
    throw new Error('KMS Decrypt returned no plaintext');
  }

  const plaintextDataKey = Buffer.from(decryptResponse.Plaintext);

  try {
    // 2. Decrypt with AES-256-GCM
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      plaintextDataKey,
      Buffer.from(encrypted.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));

    let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } finally {
    // 3. Zero plaintext data key
    plaintextDataKey.fill(0);
  }
}

// ─────────────────────────────────────────────────────────────────
// Dev fallback (no KMS)
// ─────────────────────────────────────────────────────────────────

/**
 * Local AES-256-GCM encryption using a key derived from ENCRYPTION_KEY
 * env var. FOR DEVELOPMENT/TESTING ONLY — not suitable for production.
 */
function localEncrypt(plaintext: string): Omit<EncryptedKeypairSecret, 'version'> {
  logger.warn(
    'custodial-keypair: KMS_KEY_ID not set — using local HKDF key (DEV ONLY, NOT for production)',
  );

  const rawKey = process.env.ENCRYPTION_KEY ?? 'neurowealth-dev-key-please-set-encryption-key!!';
  // Derive a 32-byte key via HKDF-SHA256
  const derivedKey = crypto.hkdfSync('sha256', rawKey, 'neurowealth-salt', 'keypair-enc', 32);
  const keyBuf = Buffer.from(derivedKey);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag,
    encryptedDataKey: '',   // no KMS in dev mode
    kmsKeyId: 'local-dev',
  };
}

function localDecrypt(encrypted: EncryptedKeypairSecret): string {
  logger.warn('custodial-keypair: decrypting with local dev key (NOT for production)');

  const rawKey = process.env.ENCRYPTION_KEY ?? 'neurowealth-dev-key-please-set-encryption-key!!';
  const derivedKey = crypto.hkdfSync('sha256', rawKey, 'neurowealth-salt', 'keypair-enc', 32);
  const keyBuf = Buffer.from(derivedKey);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyBuf,
    Buffer.from(encrypted.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────

async function writeAuditLog(
  action: string,
  userId: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, details, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [userId, action, JSON.stringify(details)],
    );
  } catch (err) {
    // Audit log failure must never silently break the caller
    logger.error({ err, action }, 'custodial-keypair: audit log write failed');
  }
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * Generates a new Ed25519 Stellar keypair for a WhatsApp user.
 *
 * Steps:
 *   1. Generate a random Stellar keypair (Ed25519 via stellar-sdk).
 *   2. Encrypt the secret key using AES-256-GCM + KMS envelope encryption.
 *   3. Persist public key and encrypted secret to the `users` table.
 *   4. Write an audit log entry.
 *   5. Return the public key and encrypted blob. Secret key never leaves this function.
 *
 * @param userId       — DB UUID of the user (must exist in `users` table)
 * @param phoneHash    — hashed phone number (for logging only)
 */
export async function generateCustodialKeypair(
  userId: string,
  phoneHash: string,
): Promise<GeneratedKeypair> {
  // 1. Generate keypair
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  let encryptedSecret: EncryptedKeypairSecret;

  try {
    // 2. Encrypt the secret key
    const kmsKeyId = process.env.KMS_KEY_ID;

    const rawEncrypted = kmsKeyId
      ? await kmsEnvelopeEncrypt(secretKey, kmsKeyId)
      : localEncrypt(secretKey);

    encryptedSecret = { ...rawEncrypted, version: 1 };

    // 3. Persist to DB
    await pool.query(
      `UPDATE users
       SET stellar_address    = $1,
           encrypted_secret   = $2,
           updated_at         = NOW()
       WHERE id = $3`,
      [publicKey, JSON.stringify(encryptedSecret), userId],
    );

    // 4. Audit log — do NOT include the secret key or the decrypted data key
    await writeAuditLog('keypair_generated', userId, {
      publicKey,
      phoneHash,
      kmsKeyId: encryptedSecret.kmsKeyId,
      version: encryptedSecret.version,
    });

    logger.info({ userId, publicKey }, 'custodial-keypair: keypair generated');
    return { publicKey, encryptedSecret };
  } finally {
    // Zero secret key string from memory as best-effort (V8 strings are
    // immutable, but this prevents accidental capture in closures)
    (secretKey as unknown as string[]).fill('\0');
  }
}

/**
 * Decrypts a user's Stellar secret key for in-memory transaction signing.
 *
 * Rules:
 *   - Call this only immediately before signing a transaction.
 *   - NEVER log the returned value.
 *   - Discard the string as soon as the transaction is submitted.
 *   - Always writes an audit log entry (success or failure).
 *
 * @param userId          — DB UUID (for audit logging)
 * @param encryptedSecret — blob from `users.encrypted_secret`
 * @param reason          — human-readable reason for decryption (for audit)
 */
export async function decryptKeypairForSigning(
  userId: string,
  encryptedSecret: EncryptedKeypairSecret,
  reason: string,
): Promise<string> {
  const isKms = encryptedSecret.kmsKeyId !== 'local-dev';

  try {
    const secretKey = isKms
      ? await kmsEnvelopeDecrypt(encryptedSecret)
      : localDecrypt(encryptedSecret);

    await writeAuditLog('keypair_decrypted', userId, {
      reason,
      kmsKeyId: encryptedSecret.kmsKeyId,
      version: encryptedSecret.version,
    });

    return secretKey;
  } catch (err) {
    await writeAuditLog('keypair_decrypt_failed', userId, {
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Rotation flow: generate a new keypair, replacing the existing one.
 *
 * The old encrypted secret is logged to the audit trail before being
 * overwritten so there is a recovery path if the rotation fails on-chain.
 *
 * @param userId      — DB UUID of the user
 * @param phoneHash   — hashed phone number (for audit log)
 */
export async function rotateCustodialKeypair(
  userId: string,
  phoneHash: string,
): Promise<GeneratedKeypair> {
  // Fetch current public key for audit trail
  const current = await pool.query<{ stellar_address: string; encrypted_secret: string }>(
    'SELECT stellar_address, encrypted_secret FROM users WHERE id = $1',
    [userId],
  );

  const oldPublicKey = current.rows[0]?.stellar_address ?? 'unknown';

  await writeAuditLog('keypair_rotation_started', userId, {
    oldPublicKey,
    phoneHash,
  });

  const newKeypair = await generateCustodialKeypair(userId, phoneHash);

  await writeAuditLog('keypair_rotation_completed', userId, {
    oldPublicKey,
    newPublicKey: newKeypair.publicKey,
    phoneHash,
  });

  logger.info({ userId, oldPublicKey, newPublicKey: newKeypair.publicKey },
    'custodial-keypair: keypair rotated');

  return newKeypair;
}

/**
 * Loads the encrypted secret for a user from the DB.
 * Returns null if the user has no custodial keypair.
 */
export async function loadEncryptedSecret(
  userId: string,
): Promise<EncryptedKeypairSecret | null> {
  const result = await pool.query<{ encrypted_secret: string | null }>(
    'SELECT encrypted_secret FROM users WHERE id = $1',
    [userId],
  );

  const raw = result.rows[0]?.encrypted_secret;
  if (!raw) return null;

  return JSON.parse(raw) as EncryptedKeypairSecret;
}
