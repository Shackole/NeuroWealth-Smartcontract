import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPhoneNumber } from './cryptoUtils';
import { getSession, updateState, UserState } from './stateManager';
import { TRANSACTION_DRAFT_TTL_MS, clearTransactionDraft } from './transactionDrafts';
import { createCustodialWallet, getWallet } from './walletService';
import { canExecuteIntent, intentQueue, processVerifiedIntent } from './webhook';

test('transaction drafts expire independently of the verified wallet session', async () => {
  const phoneHash = hashPhoneNumber('whatsapp:+15550009991');
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;

  try {
    updateState(phoneHash, UserState.VERIFIED);
    const session = getSession(phoneHash);
    const wallet = createCustodialWallet(phoneHash);

    assert.match(await processVerifiedIntent(phoneHash, 'deposit'), /Enter the USDC amount/);
    now += TRANSACTION_DRAFT_TTL_MS;
    assert.ok(canExecuteIntent(phoneHash));
    assert.match(await processVerifiedIntent(phoneHash, '50'), /no matching active transaction draft/);
    assert.strictEqual(getSession(phoneHash), session);
    assert.strictEqual(session.state, UserState.VERIFIED);
    assert.strictEqual(getWallet(phoneHash), wallet);

    assert.match(await processVerifiedIntent(phoneHash, 'withdraw'), /Enter the USDC amount/);
    now += TRANSACTION_DRAFT_TTL_MS - 1;
    assert.ok(canExecuteIntent(phoneHash));
    assert.match(await processVerifiedIntent(phoneHash, '25 USDC'), /Withdrew 25 USDC/);
    assert.match(await processVerifiedIntent(phoneHash, '25'), /no matching active transaction draft/);
    assert.strictEqual(getSession(phoneHash), session);
    assert.strictEqual(getWallet(phoneHash), wallet);
  } finally {
    clearTransactionDraft(phoneHash);
    Date.now = originalNow;
    await intentQueue.close();
  }
});
