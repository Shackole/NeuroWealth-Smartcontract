/**
 * WhatsApp Bot Conversation Flow Integration Tests (#88)
 *
 * Simulates incoming Twilio webhook payloads and verifies:
 * 1. 'deposit 50 USDC' -> intent {action: deposit, amount: 50} -> transaction queued
 * 2. 'withdraw everything' -> intent {action: withdraw_all} -> withdraw_all called
 * 3. 'what's my balance?' -> balance fetched and reply sent
 * 4. unrecognised message -> graceful fallback reply
 * 5. new user message -> OTP flow triggered
 * 6. invalid Twilio signature -> 401 rejected
 * 7. Mocked environment: No real network calls to Twilio or Stellar RPC.
 */

import assert from 'assert';
import { Request, Response, NextFunction } from 'express';
import { parseIntent } from './intentParser';
import {
  handleWhatsAppWebhook,
  twilioSignatureMiddleware,
  processVerifiedIntent,
  intentQueue,
  IntentJobData,
} from './webhook';
import { hashPhoneNumber } from './cryptoUtils';
import { getSession, updateState, UserState } from './stateManager';
import { createCustodialWallet } from './walletService';

// ── Test harness ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error('   ', (err as Error).message);
    failed++;
  }
}

// ── Mock Express Request & Response helpers ──────────────────────────────────
interface MockResponse extends Partial<Response> {
  statusCode: number;
  headers: Record<string, string>;
  bodyData: any;
  status(code: number): this;
  json(data: any): this;
  send(data: any): this;
  type(t: string): this;
}

function createMockReq(
  body: Record<string, any> = {},
  headers: Record<string, string> = {},
  protocol = 'https',
  host = 'example.com',
): Request {
  return {
    body,
    headers,
    protocol,
    get: (header: string) => {
      if (header.toLowerCase() === 'host') return host;
      return headers[header.toLowerCase()] || undefined;
    },
  } as unknown as Request;
}

function createMockRes(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.bodyData = data;
      return this;
    },
    send(data: any) {
      this.bodyData = data;
      return this;
    },
    type(t: string) {
      this.headers['content-type'] = t;
      return this;
    },
  };
  return res;
}

console.log('\n======================================================');
console.log('WhatsApp Bot Conversation Flow Tests (#88)');
console.log('======================================================\n');

async function runAllTests() {
  // ── Scenario 1: Invalid Twilio signature -> 401 rejected ───────────────────
  await runTest('invalid Twilio signature returns 401 Unauthorized', async () => {
    const savedToken = process.env.TWILIO_AUTH_TOKEN;
    const savedBaseUrl = process.env.WEBHOOK_BASE_URL;
    process.env.TWILIO_AUTH_TOKEN = 'secret_test_token_123';
    process.env.WEBHOOK_BASE_URL = 'https://example.com';

    try {
      const req = createMockReq(
        { Body: 'deposit 50 USDC', From: 'whatsapp:+14155552671' },
        { 'x-twilio-signature': 'invalid_forged_signature_xyz' },
      );
      const res = createMockRes();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      twilioSignatureMiddleware(req, res as unknown as Response, next);

      assert.strictEqual(res.statusCode, 401, 'Expected status 401 for invalid signature');
      assert.deepStrictEqual(
        res.bodyData,
        { error: 'Invalid Twilio signature' },
        'Expected invalid signature error JSON',
      );
      assert.strictEqual(nextCalled, false, 'Next middleware should not be called');
    } finally {
      process.env.TWILIO_AUTH_TOKEN = savedToken;
      process.env.WEBHOOK_BASE_URL = savedBaseUrl;
    }
  });

  // ── Scenario 2: New user message -> OTP flow triggered ───────────────────────
  await runTest('new user message triggers OTP verification flow', async () => {
    const fromPhone = 'whatsapp:+15550001111';
    const phoneHash = hashPhoneNumber(fromPhone);

    // Ensure session starts UNVERIFIED
    updateState(phoneHash, UserState.UNVERIFIED);
    assert.strictEqual(getSession(phoneHash).state, UserState.UNVERIFIED);

    const req = createMockReq({
      From: fromPhone,
      Body: 'hi',
    });
    const res = createMockRes();

    await handleWhatsAppWebhook(req, res as unknown as Response);

    // Session should transition to AWAITING_OTP
    assert.strictEqual(
      getSession(phoneHash).state,
      UserState.AWAITING_OTP,
      'Session should transition to AWAITING_OTP',
    );

    // Response should be TwiML with OTP instructions
    const responseXml = String(res.bodyData);
    assert.ok(responseXml.includes('Welcome to NeuroWealth AI!'), 'Welcome message sent');
    assert.ok(responseXml.includes('Your OTP code is:'), 'Contains OTP code prompt');
    assert.ok(responseXml.includes('Expires in 5 minutes'), 'Mentions OTP expiration');
  });

  // ── Scenario 3: 'deposit 50 USDC' -> intent {action: deposit, amount: 50} ───
  await runTest("'deposit 50 USDC' parses intent and executes deposit transaction", async () => {
    const rawMessage = 'deposit 50 USDC';
    const intent = parseIntent(rawMessage);

    // Verify structured intent mapping
    assert.strictEqual(intent.action, 'deposit', 'Intent action should be deposit');
    assert.strictEqual(intent.type, 'DEPOSIT', 'Intent type should be DEPOSIT');
    assert.strictEqual(intent.amount, 50, 'Intent amount should be 50');

    // Verify user execution flow
    const fromPhone = 'whatsapp:+15550002222';
    const phoneHash = hashPhoneNumber(fromPhone);
    updateState(phoneHash, UserState.VERIFIED);
    createCustodialWallet(phoneHash);

    // Mock capturing queued jobs
    let capturedJob: IntentJobData | null = null;
    const originalAdd = intentQueue.add.bind(intentQueue);
    intentQueue.add = async (data: IntentJobData) => {
      capturedJob = data;
      return { id: 'mock-job-id', data } as any;
    };

    try {
      const req = createMockReq({
        From: fromPhone,
        Body: rawMessage,
      });
      const res = createMockRes();

      await handleWhatsAppWebhook(req, res as unknown as Response);

      // Webhook replies with immediate acknowledgement to stay under 15s timeout
      const ackXml = String(res.bodyData);
      assert.ok(ackXml.includes('Processing your request'), 'Immediate ack returned');

      // Intent should be enqueued into Bull queue
      assert.ok(capturedJob !== null, 'Job should be queued in Bull');
      assert.strictEqual((capturedJob as any).messageBody, rawMessage);
      assert.strictEqual((capturedJob as any).phoneHash, phoneHash);

      // Worker executes intent
      const reply = await processVerifiedIntent(phoneHash, rawMessage);
      assert.ok(reply.includes('Deposited 50 USDC'), 'Reply confirms 50 USDC deposit');
      assert.ok(reply.includes('Transaction Hash:'), 'Reply includes transaction hash');
      assert.ok(reply.includes('Confirmed in 4 seconds on Stellar!'), 'Reply confirms Stellar settlement');
    } finally {
      intentQueue.add = originalAdd;
    }
  });

  // ── Scenario 4: 'withdraw everything' -> intent {action: withdraw_all} ──────
  await runTest("'withdraw everything' parses intent and executes withdraw_all", async () => {
    const rawMessage = 'withdraw everything';
    const intent = parseIntent(rawMessage);

    // Verify structured intent mapping
    assert.strictEqual(intent.action, 'withdraw_all', 'Intent action should be withdraw_all');
    assert.strictEqual(intent.type, 'WITHDRAW', 'Intent type should be WITHDRAW');
    assert.strictEqual(intent.withdrawAll, true, 'Intent withdrawAll should be true');

    const fromPhone = 'whatsapp:+15550003333';
    const phoneHash = hashPhoneNumber(fromPhone);
    updateState(phoneHash, UserState.VERIFIED);
    createCustodialWallet(phoneHash);

    const reply = await processVerifiedIntent(phoneHash, rawMessage);
    assert.ok(reply.includes('Withdrew all funds from vault contract'), 'Reply confirms full withdrawal');
    assert.ok(reply.includes('Transaction Hash:'), 'Reply includes transaction hash');
    assert.ok(reply.includes('Funds sent directly to your wallet!'), 'Funds sent notice present');
  });

  // ── Scenario 5: 'what\'s my balance?' -> balance fetched and reply sent ──────
  await runTest("'what\\'s my balance?' fetches balance and replies with portfolio details", async () => {
    const rawMessage = "what's my balance?";
    const intent = parseIntent(rawMessage);

    assert.strictEqual(intent.action, 'balance', 'Intent action should be balance');
    assert.strictEqual(intent.type, 'BALANCE', 'Intent type should be BALANCE');

    const fromPhone = 'whatsapp:+15550004444';
    const phoneHash = hashPhoneNumber(fromPhone);
    updateState(phoneHash, UserState.VERIFIED);
    createCustodialWallet(phoneHash);

    const reply = await processVerifiedIntent(phoneHash, rawMessage);
    assert.ok(reply.includes('Your NeuroWealth Portfolio'), 'Contains portfolio header');
    assert.ok(reply.includes('Balance: 100.25 USDC'), 'Contains correct USDC balance');
    assert.ok(reply.includes('Current APY: 8.4%'), 'Contains current APY');
    assert.ok(reply.includes('Strategy: Balanced'), 'Contains active strategy');
  });

  // ── Scenario 6: Unrecognised message -> graceful fallback reply ─────────────
  await runTest('unrecognised message returns graceful fallback help reply', async () => {
    const rawMessage = 'asdfghjk random gibberish 999';
    const intent = parseIntent(rawMessage);

    assert.strictEqual(intent.action, 'unknown', 'Intent action should be unknown');
    assert.strictEqual(intent.type, 'UNKNOWN', 'Intent type should be UNKNOWN');

    const fromPhone = 'whatsapp:+15550005555';
    const phoneHash = hashPhoneNumber(fromPhone);
    updateState(phoneHash, UserState.VERIFIED);
    createCustodialWallet(phoneHash);

    const reply = await processVerifiedIntent(phoneHash, rawMessage);
    assert.ok(reply.includes("I didn't quite catch that. Try:"), 'Provides polite guidance');
    assert.ok(reply.includes('deposit 50 USDC'), 'Offers deposit example command');
    assert.ok(reply.includes("what's my balance"), 'Offers balance example command');
    assert.ok(reply.includes('withdraw all'), 'Offers withdraw example command');
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
