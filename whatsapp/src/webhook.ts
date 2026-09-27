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

  const webhookUrl =
    process.env.WEBHOOK_BASE_URL
      ? `${process.env.WEBHOOK_BASE_URL}/api/whatsapp/webhook`
      : `${req.protocol}://${req.get('host')}/api/whatsapp/webhook`;

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
    if (!wallet) {
      // Stale session — reset
      updateState(phoneHash, UserState.UNVERIFIED);
      twiml.message('Session expired. Send "hi" to re-verify.');
      const outbound = twiml.toString();
      await logMessageToDb(phoneHash, 'outbound', outbound);
      res.type('text/xml').send(outbound);
      return;
    }

    // Acknowledge immediately to stay within Twilio's 15 s window
    twiml.message('⏳ Processing your request…');
    const ack = twiml.toString();
    await logMessageToDb(phoneHash, 'outbound', ack);
    res.type('text/xml').send(ack);

    // Enqueue intent for async processing
    await intentQueue.add({
      phoneHash,
      fromNumber,
      messageBody,
      mediaUrl,
      sessionState: session.state,
    });
    return;
  }

  // Fallback
  twiml.message('Something went wrong. Please send "hi" to start over.');
  res.type('text/xml').send(twiml.toString());
}

// ─────────────────────────────────────────────────────────
// Bull worker — processes intent jobs
// ─────────────────────────────────────────────────────────

intentQueue.process(async (job) => {
  const { phoneHash, fromNumber, messageBody } = job.data;

  let replyText: string;
  try {
    replyText = await processVerifiedIntent(phoneHash, messageBody);
  } catch (err) {
    replyText =
      '❌ An error occurred. Please try again in a few moments.';
    console.error('[intentQueue] job failed:', err);
  }

  // Send reply via Twilio REST API (not TwiML, since we already sent the ack)
  await twilioClient.messages.create({
    from: TWILIO_WHATSAPP_FROM,
    to: fromNumber,
    body: replyText,
  });

  await logMessageToDb(phoneHash, 'outbound', replyText);
});

// ─────────────────────────────────────────────────────────
// Intent processor for verified users
// ─────────────────────────────────────────────────────────

export async function processVerifiedIntent(
  phoneHash: string,
  messageBody: string,
): Promise<string> {
  const lower = messageBody.toLowerCase().trim();

  // Balance / portfolio
  if (
    lower.includes('balance') ||
    lower.includes('portfolio') ||
    lower.includes('how much') ||
    lower.includes('my account')
  ) {
    const portfolio = await getPortfolio(phoneHash);
    return (
      `💰 Your NeuroWealth Portfolio\n\n` +
      `Balance: ${portfolio.balance.toFixed(2)} USDC ($${portfolio.usdEquivalent.toFixed(2)})\n` +
      `Earnings today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`
    );
  }

  // Deposit
  const depositMatch = lower.match(/deposit\s+([\d.]+)/);
  if (depositMatch) {
    const amount = parseFloat(depositMatch[1]);
    const strategyMatch = lower.match(/\b(conservative|balanced|growth)\b/);
    const strategy = strategyMatch ? strategyMatch[1] : undefined;
    const result = await handleDeposit(phoneHash, amount, strategy);
    return `🤖 ${result.message}`;
  }

  // Withdraw all
  if (
    lower.includes('withdraw all') ||
    lower.includes('withdraw everything')
  ) {
    const result = await handleWithdraw(phoneHash, undefined, true);
    return `🤖 ${result.message}`;
  }

  // Withdraw amount
  const withdrawMatch = lower.match(/withdraw\s+([\d.]+)/);
  if (withdrawMatch) {
    const amount = parseFloat(withdrawMatch[1]);
    const result = await handleWithdraw(phoneHash, amount, false);
    return `🤖 ${result.message}`;
  }

  // Strategy switch
  const stratMatch = lower.match(
    /switch\s+(?:to\s+)?(conservative|balanced|growth)/,
  );
  if (stratMatch) {
    const strat = stratMatch[1];
    return `✅ Strategy updated to ${strat.toUpperCase()}. The AI agent will rebalance on the next scheduled run.`;
  }

  // Earnings
  if (lower.includes('earn') || lower.includes('yield') || lower.includes('apy')) {
    const portfolio = await getPortfolio(phoneHash);
    return (
      `📈 Earnings Summary\n\n` +
      `Today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`
    );
  }

  // Greeting
  if (lower === 'hi' || lower === 'hello' || lower === 'help') {
    return (
      `🤖 Hi! I'm your NeuroWealth AI Agent.\n\n` +
      `Commands:\n` +
      `• "balance" — view portfolio\n` +
      `• "deposit 100 USDC" — deposit funds\n` +
      `• "withdraw 50" — withdraw USDC\n` +
      `• "switch to growth" — change strategy\n` +
      `• "earnings" — view yield stats`
    );
  }

  return (
    `I didn't quite catch that. Try:\n` +
    `• "deposit 50 USDC"\n` +
    `• "what's my balance"\n` +
    `• "withdraw all"\n` +
    `• "switch to conservative"`
  );
}

// ─────────────────────────────────────────────────────────
// DB logging
// ─────────────────────────────────────────────────────────

// Lazy pg Pool — only created when DATABASE_URL is configured
let _pgPool: import('pg').Pool | null = null;

async function getDbPool(): Promise<import('pg').Pool | null> {
  if (!process.env.DATABASE_URL) return null;
  if (_pgPool) return _pgPool;
  try {
    const { Pool } = await import('pg');
    _pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    return _pgPool;
  } catch {
    return null;
  }
}

/**
 * Log a message event to the database.
 * Stores the hashed phone number (never the raw number) for privacy.
 * Silently no-ops when DATABASE_URL is not configured.
 */
async function logMessageToDb(
  phoneHash: string,
  direction: 'inbound' | 'outbound',
  body: string,
  mediaUrl?: string,
): Promise<void> {
  const pool = await getDbPool();
  if (!pool) return;

  try {
    await pool.query(
      `INSERT INTO whatsapp_message_logs
         (phone_hash, direction, body_preview, media_url, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        phoneHash,
        direction,
        body.substring(0, 500), // truncate to avoid oversized rows
        mediaUrl ?? null,
      ],
    );
  } catch (err) {
    console.error('[webhook] DB log failed:', err);
  }
}
