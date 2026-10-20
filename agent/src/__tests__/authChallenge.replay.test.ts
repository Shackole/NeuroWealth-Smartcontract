import { Keypair } from '@stellar/stellar-sdk';
import type { Redis } from 'ioredis';
import {
  buildChallengeMessage,
  consumeNonce,
  issueNonce,
  verifyStellarSignature,
} from '../authService';

function nonceStore(): Redis {
  const values = new Map<string, string>();
  return {
    set: jest.fn(async (key: string, value: string) => { values.set(key, value); return 'OK'; }),
    eval: jest.fn(async (_script: string, _keyCount: number, key: string) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    }),
  } as unknown as Redis;
}

describe('SIWS challenge replay and identity binding', () => {
  it('uses stable challenge bytes and accepts only the matching wallet signature', () => {
    const owner = Keypair.random();
    const attacker = Keypair.random();
    const challenge = buildChallengeMessage(owner.publicKey(), 'nonce-123');
    const signature = owner.sign(Buffer.from(challenge, 'utf8')).toString('base64');

    expect(buildChallengeMessage(owner.publicKey(), 'nonce-123')).toBe(challenge);
    expect(verifyStellarSignature(owner.publicKey(), challenge, signature)).toBe(true);
    expect(verifyStellarSignature(attacker.publicKey(), challenge, signature)).toBe(false);
    expect(verifyStellarSignature(owner.publicKey(), challenge, attacker.sign(Buffer.from(challenge)).toString('base64'))).toBe(false);
  });

  it('atomically consumes a challenge once under concurrent verification', async () => {
    const redis = nonceStore();
    const address = Keypair.random().publicKey();
    const nonce = await issueNonce(redis, address);

    const results = await Promise.all([
      consumeNonce(redis, address),
      consumeNonce(redis, address),
      consumeNonce(redis, address),
    ]);
    expect(results.filter((value) => value === nonce)).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(2);
    expect(await consumeNonce(redis, address)).toBeNull();
  });

  it('rejects a challenge that is absent or expired in Redis', async () => {
    const redis = nonceStore();
    await expect(consumeNonce(redis, Keypair.random().publicKey())).resolves.toBeNull();
  });
});
