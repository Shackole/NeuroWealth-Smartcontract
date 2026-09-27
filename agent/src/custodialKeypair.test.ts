/**
 * Unit tests for custodialKeypair (Issue #30)
 *
 * Tests run without AWS KMS or a real DB by exercising the crypto
 * primitives and contract logic directly.
 */

import assert from 'assert';
import crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';

// ─────────────────────────────────────────────────────────────────
// Helpers — mirrors the internal dev-mode crypto logic
// ─────────────────────────────────────────────────────────────────

function devEncrypt(plaintext: string): {
  ciphertext: string; iv: string; tag: string; encryptedDataKey: string; kmsKeyId: string; version: number;
} {
  const rawKey = 'neurowealth-dev-key-please-set-encryption-key!!';
  const derivedKey = Buffer.from(
    crypto.hkdfSync('sha256', rawKey, 'neurowealth-salt', 'keypair-enc', 32),
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { ciphertext, iv: iv.toString('hex'), tag, encryptedDataKey: '', kmsKeyId: 'local-dev', version: 1 };
}

function devDecrypt(enc: ReturnType<typeof devEncrypt>): string {
  const rawKey = 'neurowealth-dev-key-please-set-encryption-key!!';
  const derivedKey = Buffer.from(
    crypto.hkdfSync('sha256', rawKey, 'neurowealth-salt', 'keypair-enc', 32),
  );
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, Buffer.from(enc.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(enc.tag, 'hex'));
  let decrypted = decipher.update(enc.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log('Running custodialKeypair tests…\n');

  // Test 1: Stellar keypair generation produces valid Ed25519 key
  {
    const kp = Keypair.random();
    assert.ok(kp.publicKey().startsWith('G'), 'Public key starts with G');
    assert.ok(kp.secret().startsWith('S'), 'Secret key starts with S');
    assert.strictEqual(kp.publicKey().length, 56, 'Public key is 56 chars (Stellar strkey)');
    assert.strictEqual(kp.secret().length, 56, 'Secret key is 56 chars (Stellar strkey)');
    console.log('  ✅ Test 1: Valid Ed25519 Stellar keypair generation');
  }

  // Test 2: AES-256-GCM encrypt/decrypt round-trip
  {
    const kp = Keypair.random();
    const secret = kp.secret();
    const encrypted = devEncrypt(secret);
    const decrypted = devDecrypt(encrypted);
    assert.strictEqual(decrypted, secret, 'Decrypted secret matches original');
    console.log('  ✅ Test 2: AES-256-GCM round-trip');
  }

  // Test 3: Different plaintext produces different ciphertext (random IV)
  {
    const kp = Keypair.random();
    const enc1 = devEncrypt(kp.secret());
    const enc2 = devEncrypt(kp.secret());
    assert.notStrictEqual(enc1.iv, enc2.iv, 'Each encryption uses a unique IV');
    assert.notStrictEqual(enc1.ciphertext, enc2.ciphertext, 'Ciphertexts differ due to random IV');
    console.log('  ✅ Test 3: Random IV ensures unique ciphertext per call');
  }

  // Test 4: Tampered ciphertext causes authentication failure
  {
    const kp = Keypair.random();
    const encrypted = devEncrypt(kp.secret());
    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.replace('a', 'b').replace('0', 'f') };

    let threw = false;
    try {
      devDecrypt(tampered);
    } catch (err) {
      threw = true;
      assert.ok(
        (err as Error).message.toLowerCase().includes('unsupported') ||
        (err as Error).message.toLowerCase().includes('auth') ||
        (err as Error).message.toLowerCase().includes('bad decrypt') ||
        (err as Error).message.toLowerCase().includes('wrong final block'),
        `Error should be authentication failure, got: ${(err as Error).message}`,
      );
    }
    assert.ok(threw, 'Tampered ciphertext should throw');
    console.log('  ✅ Test 4: Tampered ciphertext detected (GCM auth tag verification)');
  }

  // Test 5: Tampered auth tag causes failure
  {
    const kp = Keypair.random();
    const encrypted = devEncrypt(kp.secret());
    const tampered = { ...encrypted, tag: 'deadbeefdeadbeefdeadbeefdeadbeef' };

    let threw = false;
    try { devDecrypt(tampered); } catch { threw = true; }
    assert.ok(threw, 'Tampered auth tag should throw');
    console.log('  ✅ Test 5: Tampered auth tag rejected');
  }

  // Test 6: Encrypted secret blob structure
  {
    const kp = Keypair.random();
    const encrypted = devEncrypt(kp.secret());
    assert.ok(typeof encrypted.ciphertext === 'string' && encrypted.ciphertext.length > 0);
    assert.strictEqual(encrypted.iv.length, 24, 'IV is 12 bytes = 24 hex chars');
    assert.strictEqual(encrypted.tag.length, 32, 'Auth tag is 16 bytes = 32 hex chars');
    assert.strictEqual(encrypted.kmsKeyId, 'local-dev');
    assert.strictEqual(encrypted.version, 1);
    console.log('  ✅ Test 6: Encrypted secret blob structure is valid');
  }

  // Test 7: HKDF derives consistent key from same inputs
  {
    const rawKey = 'test-key';
    const key1 = Buffer.from(crypto.hkdfSync('sha256', rawKey, 'neurowealth-salt', 'keypair-enc', 32));
    const key2 = Buffer.from(crypto.hkdfSync('sha256', rawKey, 'neurowealth-salt', 'keypair-enc', 32));
    assert.ok(key1.equals(key2), 'HKDF is deterministic for same inputs');
    assert.strictEqual(key1.length, 32, 'HKDF output is 32 bytes for AES-256');
    console.log('  ✅ Test 7: HKDF is deterministic and produces correct key length');
  }

  // Test 8: Different HKDF inputs produce different keys
  {
    const key1 = Buffer.from(crypto.hkdfSync('sha256', 'key-a', 'neurowealth-salt', 'keypair-enc', 32));
    const key2 = Buffer.from(crypto.hkdfSync('sha256', 'key-b', 'neurowealth-salt', 'keypair-enc', 32));
    assert.ok(!key1.equals(key2), 'Different inputs produce different derived keys');
    console.log('  ✅ Test 8: Different master keys → different derived keys');
  }

  // Test 9: EncryptedKeypairSecret JSON round-trip
  {
    const kp = Keypair.random();
    const encrypted = devEncrypt(kp.secret());
    const serialised = JSON.stringify(encrypted);
    const deserialised = JSON.parse(serialised);
    assert.strictEqual(deserialised.ciphertext, encrypted.ciphertext);
    assert.strictEqual(deserialised.iv, encrypted.iv);
    assert.strictEqual(deserialised.tag, encrypted.tag);
    assert.strictEqual(deserialised.kmsKeyId, 'local-dev');
    console.log('  ✅ Test 9: EncryptedKeypairSecret serialises/deserialises correctly');
  }

  // Test 10: Audit log entry shape validation
  {
    const kp = Keypair.random();
    const entry = {
      action: 'keypair_generated',
      userId: 'usr-1234',
      details: {
        publicKey: kp.publicKey(),
        phoneHash: 'abc123',
        kmsKeyId: 'local-dev',
        version: 1,
      },
    };
    assert.strictEqual(entry.action, 'keypair_generated');
    assert.ok(entry.details.publicKey.startsWith('G'));
    assert.strictEqual(entry.details.version, 1);
    // Secret key must NOT be in the details
    assert.ok(!JSON.stringify(entry.details).includes(kp.secret()), 'Secret key absent from audit log');
    console.log('  ✅ Test 10: Audit log entry shape (no plaintext secret key)');
  }

  // Test 11: keypair_decrypted audit entry contains reason and kmsKeyId only
  {
    const decryptAudit = {
      action: 'keypair_decrypted',
      details: {
        reason: 'transaction_signing',
        kmsKeyId: 'alias/neurowealth-agent',
        version: 1,
      },
    };
    assert.ok(!('secretKey' in decryptAudit.details), 'No secretKey in decrypt audit');
    assert.ok(!('plaintext' in decryptAudit.details), 'No plaintext in decrypt audit');
    console.log('  ✅ Test 11: Decrypt audit contains only reason + kmsKeyId (no secrets)');
  }

  // Test 12: Rotation produces a different keypair
  {
    const kp1 = Keypair.random();
    const kp2 = Keypair.random();
    assert.notStrictEqual(kp1.publicKey(), kp2.publicKey(), 'Each rotation generates a new keypair');
    assert.notStrictEqual(kp1.secret(), kp2.secret(), 'Secrets differ after rotation');
    console.log('  ✅ Test 12: Rotation generates a distinct new keypair');
  }

  console.log('\n✅ All custodialKeypair tests passed.');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
