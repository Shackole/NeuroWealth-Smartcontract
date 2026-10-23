/**
 * WhatsApp Webhook Handler — Twilio integration (#24)
 *
 * POST /api/whatsapp/webhook
 * - Validates Twilio request signature before any processing
 * - Extracts sender phone (hashed SHA-256), message body, and optional media
 * - Enforces per-phone rate limit: max 10 messages per minute
 * - New-user flow: OTP phone verification before any transaction
 * - Enqueues intent execution in Bull queue to respect Twilio 15 s timeout
 * - Logs all messages to DB (hashed phone, direction, timestamp)
 * - Sends reply via Twilio Messages API (twiml or REST client)
 *
 * Proxy configuration (#426):
 * When deployed behind a reverse proxy / load balancer, the canonical URL
 * used for Twilio signature verification must match the URL Twilio signed.
 * Set `WEBHOOK_BASE_URL` (e.g. `https://api.example.com`) to pin the exact
 * public origin, OR ensure Express `trust proxy` is enabled so that
 * `X-Forwarded-Proto` / `X-Forwarded-Host` are honoured. Without one of
 * these, `req.protocol`/`req.get('host')` reflect the internal hop and
 * signature validation will fail with 401.
 */

import { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { hashPhoneNumber } from './cryptoUtils';
import { getSession, updateState, UserState } from './stateManager';
import { generateOTP, verifyOTP } from './otpService';
import { createCustodialWallet, getWallet } from './walletService';
import { getPortfolio, handleDeposit, handleWithdraw } from './vaultRouter';
import Queue from 'bull';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────
// Twilio client
// ─────────────────────────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
const TWILIO_WHATSAPP_FROM =
  process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// ─────────────────────────────────────────────────────────
// Bull queue — async intent processing
// ─────────────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const intentQueue = new Queue<IntentJobData>('whatsapp-intent', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export interface IntentJobData {
  phoneHash: string;
  fromNumber: string;
  messageBody: string;
  mediaUrl?: string;
  sessionState: UserState;
}

// ─────────────────────────────────────────────────────────
// Rate limiter  (in-memory window, Redis-backed in prod)
// ─────────────────────────────────────────────────────────
const RATE_LIMIT_MAX = 10;     // messages
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export function checkWebhookRateLimit(phoneHash: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(phoneHash);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(phoneHash, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

// ─────────────────────────────────────────────────────────
// Replay protection — dedupe inbound provider message IDs
// ─────────────────────────────────────────────────────────
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const seenMessageIds = new Map<string, number>();

/**
 * Returns true the first time a provider message ID is observed, false on
 * any subsequent delivery within the TTL window. Twilio retries deliveries
 * (and may deliver duplicates), so this guarantees each inbound message is
 * processed at most once logically.
 */
export function isDuplicateMessage(messageId: string | undefined): boolean {
  if (!messageId) {
    // No provider ID available — cannot dedupe; treat as non-duplicate.
    return false;
  }

  const now = Date.now();

  // Opportunistic cleanup of expired entries.
  for (const [id, ts] of seenMessageIds) {
    if (now - ts > DEDUPE_TTL_MS) {
      seenMessageIds.delete(id);
    }
  }

  if (seenMessageIds.has(messageId)) {
    return true;
  }

  seenMessageIds.set(messageId, now);
  return false;
}

// ─────────────────────────────────────────────────────────
// Canonical webhook URL (proxy-aware)
// ─────────────────────────────────────────────────────────

/**
 * Resolve the canonical public URL Twilio signed. Prefers an explicit
 * `WEBHOOK_BASE_URL`; otherwise reconstructs from proxy-aware headers
 * (`X-Forwarded-Proto` / `X-Forwarded-Host`) when present, falling back to
 * the direct request protocol/host.
 */
export function resolveCanonicalWebhookUrl(req: Request): string {
  const base = process.env.WEBHOOK_BASE_URL;
  if (base) {
    return `${base.replace(/\/$/, '')}/api/whatsapp/webhook`;
  }

  const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)
    ?.split(',')[0]
    .trim();
  const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)
    ?.split(',')[0]
    .trim();

  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');

  return `${proto}://${host}/api/whatsapp/webhook`;
}

// ─────────────────────────────────────────────────────────
// Twilio signature validation middleware
// ─────────────────────────────────────────────────────────

/**
 * Express middleware that validates the incoming Twilio webhook signature.
 * Rejects requests with an invalid or missing X-Twilio-Signature header.
 *
 * In test environments (TWILIO_AUTH_TOKEN not set) validation is skipped so
 * integration tests can run without real credentials.
 */
export function twilioSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!authToken) {
    // Skip validation in test/dev environments
    next();
    return;
  }

  const webhookUrl = resolveCanonicalWebhookUrl(req);

  const signature = req.headers['x-twilio-signature'] as string | undefined;

  const isValid = twilio.validateRequest(
    authToken,
    signature ?? '',
    webhookUrl,
    req.body as Record<string, string>,
  );

  if (!isValid) {
    res.status(401).json({ error: 'Invalid Twilio signature' });
    return;
  }

  next();
}

// ─────────────────────────────────────────────────────────
// Main webhook handler
// ─────────────────────────────────────────────────────────

/**
 * POST /api/whatsapp/webhook
 *
 * Entry point for all incoming Twilio WhatsApp messages.
 * Returns TwiML immediately (within Twilio's 15 s timeout) and offloads
 * heavy work (intent parsing, on-chain tx) to the Bull queue.
 */
export async function handleWhatsAppWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const MessagingResponse = twilio.twiml.MessagingResponse;
  const twiml = new MessagingResponse();

  // ── Replay protection: dedupe provider message ID ─────────────────────────
  const messageSid: string | undefined =
    (req.body.MessageSid as string | undefined) ||
    (req.body.SmsMessageSid as string | undefined);

  if (isDuplicateMessage(messageSid)) {
    // Acknowledge without re-processing so Twilio stops retrying.
    res.status(200).type('text/xml').send(twiml.toString());
    return;
  }

  // ── Extract message fields ────────────────────────────────────────────────
  const fromNumber: string = (req.body.From as string) || '';
  const messageBody: string = ((req.body.Body as string) || '').trim();
  const mediaUrl: string | undefined = req.body.MediaUrl0 as string | undefined;

  if (!fromNumber) {
    res.status(400).send('Missing sender phone number');
    return;
  }

  // ── Privacy: hash the phone number at rest ────────────────────────────────
  const phoneHash = hashPhoneNumber(fromNumber);

  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (!checkWebhookRateLimit(phoneHash)) {
    twiml.message(
      '⚠️ Rate limit exceeded. Please wait a minute before sending another message.',
    );
    res.type('text/xml').send(twiml.toString());

    await logMessageToDb(phoneHash, 'inbound', messageBody);
    await logMessageToDb(
      phoneHash,
      'outbound',
      '⚠️ Rate limit exceeded.',
    );
    return;
  }

  // ── Log inbound message ───────────────────────────────────────────────────
  await logMessageToDb(phoneHash, 'inbound', messageBody, mediaUrl);

  // ── Session state ─────────────────────────────────────────────────────────
  const session = getSession(phoneHash);

  // ── New-user flow: immediate synchronous OTP exchange ────────────────────
  // (fast path — no queue needed, no on-chain calls)
  if (session.state === UserState.UNVERIFIED) {
    const normalised = messageBody.toLowerCase().trim();
    if (
      normalised === 'hi' ||
      normalised === 'hello' ||
      normalised === 'start' ||
      normalised === ''
    ) {
      const otpCode = generateOTP(phoneHash);
      updateState(phoneHash, UserState.AWAITING_OTP);

      twiml.message(
        `👋 Welcome to NeuroWealth AI!\n\n` +
          `To secure your wallet, please enter your 6-digit OTP code.\n\n` +
          `🔑 Your OTP code is: ${otpCode}\n` +
          `(Expires in 5 minutes)`,
      );
    } else {
      twiml.message(
        'Welcome to NeuroWealth! Send "hi" to start verification.',
      );
    }

    const outbound = twiml.toString();
    await logMessageToDb(phoneHash, 'outbound', outbound);
    res.type('text/xml').send(outbound);
    return;
  }

  if (session.state === UserState.AWAITING_OTP) {
    const digits = messageBody.replace(/\D/g, '');
    if (digits.length === 6) {
      const result = verifyOTP(phoneHash, digits);
      if (result.success) {
        updateState(phoneHash, UserState.VERIFIED);
        const wallet = createCustodialWallet(phoneHash);

        twiml.message(
          `✅ Phone verified!\n\n` +
            `🔒 Your Stellar wallet:\n` +
            `${wallet.publicKey.substring(0, 8)}…${wallet.publicKey.slice(-8)}\n\n` +
            `Try:\n` +
            `• "deposit 100 USDC"\n` +
            `• "what's my balance"\n` +
            `• "withdraw 50"\n` +
            `• "switch to growth"`,
        );
      } else {
        twiml.message(`❌ ${result.message}`);
      }
    } else {
      twiml.message(
        'Please enter the 6-digit verification code (digits only).',
      );
    }

    const outbound = twiml.toString();
    await logMessageToDb(phoneHash, 'outbound', outbound);
    res.type('text/xml').send(outbound);
    return;
  }

  // ── Verified users: enqueue intent job ───────────────────────────────────
  if (session.state === UserState.VERIFIED) {
    const wallet = getWallet(phoneHash);
    if (!wal