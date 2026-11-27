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
import { getSession, getSessionLocale, updateState, UserState } from './stateManager';
import { resolveLocale, translate } from './locale';
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
export const INTENT_JOB_ATTEMPTS = 1;

export const intentQueue = new Queue<IntentJobData>('whatsapp-intent', REDIS_URL, {
  defaultJobOptions: {
    // A timed-out financial operation may already have settled on-chain. Do not
    // resubmit it automatically; require a fresh user command after resolution.
    attempts: INTENT_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: 2000 },
    // Keep completed job IDs as the idempotency ledger; a bounded cleaner below
    // retains them for the provider retry window.
    removeOnComplete: false,
    removeOnFail: false,
  },
});

const PROVIDER_RETRY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const INTENT_WORKER_CONCURRENCY = 1;
const completedJobCleanup = setInterval(() => {
  void intentQueue.clean(PROVIDER_RETRY_RETENTION_MS, 'completed').catch((error) => {
    console.error('[intentQueue] completed-job cleanup failed:', error);
  });
}, 6 * 60 * 60 * 1000);
completedJobCleanup.unref();

export interface IntentJobData {
  phoneHash: string;
  fromNumber: string;
  messageBody: string;
  mediaUrl?: string;
  sessionState: UserState;
  messageSid: string;
}

export function canExecuteIntent(phoneHash: string): boolean {
  return getSession(phoneHash).state === UserState.VERIFIED && Boolean(getWallet(phoneHash));
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
    // Local tests and development can run without provider credentials, but a
    // production webhook must fail closed rather than accept unsigned requests.
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ error: 'Webhook signature validation is not configured' });
      return;
    }
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
  const messageSid = typeof req.body.MessageSid === 'string' ? req.body.MessageSid.trim() : '';

  if (!fromNumber || !messageSid) {
    res.status(400).send(!fromNumber ? 'Missing sender phone number' : 'Missing provider message id');
    return;
  }

  // ── Privacy: hash the phone number at rest ────────────────────────────────
  const phoneHash = hashPhoneNumber(fromNumber);

  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (!checkWebhookRateLimit(phoneHash)) {
    const reply = translate(
      getSessionLocale(phoneHash),
      '⚠️ Rate limit exceeded. Please wait a minute before sending another message.',
      '⚠️ Alcanzaste el límite de mensajes. Espera un minuto antes de enviar otro.',
    );
    twiml.message(reply);
    res.type('text/xml').send(twiml.toString());

    await logMessageToDb(phoneHash, 'inbound', messageBody);
    await logMessageToDb(phoneHash, 'outbound', reply);
    return;
  }

  // ── Log inbound message ───────────────────────────────────────────────────
  await logMessageToDb(phoneHash, 'inbound', messageBody, mediaUrl);

  const session = getSession(phoneHash);
  const t = (english: string, spanish: string) => translate(session.locale, english, spanish);

  // Language can be selected before verification and changed at any step.
  const languageCommand = /^(?:language|idioma)(?:\s+(\S+))?$/i.exec(messageBody);
  if (languageCommand) {
    const requested = languageCommand[1];
    if (requested) session.locale = resolveLocale(requested);
    const reply = requested
      ? t('Language set to English.', 'Idioma cambiado a español.')
      : t(
        'Send "language en" for English or "language es" for Spanish.',
        'Envía "language en" para inglés o "language es" para español.',
      );
    twiml.message(reply);
    const outbound = twiml.toString();
    await logMessageToDb(phoneHash, 'outbound', outbound);
    res.type('text/xml').send(outbound);
    return;
  }

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

      twiml.message(t(
        `👋 Welcome to NeuroWealth AI!\n\n` +
        `To secure your wallet, please enter your 6-digit OTP code.\n\n` +
        `🔑 Your OTP code is: ${otpCode}\n` +
        `(Expires in 5 minutes)`,
        `👋 ¡Te damos la bienvenida a NeuroWealth AI!\n\n` +
        `Para proteger tu billetera, introduce tu código de verificación de 6 dígitos.\n\n` +
        `🔑 Tu código de verificación es: ${otpCode}\n` +
        `(Caduca en 5 minutos)`,
      ));
    } else {
      twiml.message(t(
        'Welcome to NeuroWealth! Send "hi" to start verification.',
        '¡Te damos la bienvenida a NeuroWealth! Envía "hi" para iniciar la verificación.',
      ));
    }

    const outbound = twiml.toString();
    await logMessageToDb(phoneHash, 'outbound', outbound);
    res.type('text/xml').send(outbound);
    return;
  }

  if (session.state === UserState.AWAITING_OTP) {
    const digits = messageBody.replace(/\D/g, '');
    if (digits.length === 6) {
      const result = verifyOTP(phoneHash, digits, session.locale);
      if (result.success) {
        updateState(phoneHash, UserState.AWAITING_CUSTODIAL_CONSENT);
        twiml.message(t(
          `✅ Phone verified. Before we create a wallet, please review how this WhatsApp account works.\n\n` +
          `NeuroWealth creates and operates a custodial Stellar wallet for you. The signing key is encrypted and held by NeuroWealth's backend; you do not control or receive the secret key. Transfers are signed by the service after your WhatsApp request.\n\n` +
          `Recovery is limited: if the service loses the key or cannot verify your phone, it may not be possible to recover wallet access. Keep your phone number secure and contact support before changing it. Do not send passwords, OTPs, or secret keys in chat.\n\n` +
          `After setup you can ask for help, check balance or earnings, deposit USDC, withdraw USDC, and change your strategy. To fund the wallet, first create it, then send USDC on Stellar to the address we provide.\n\n` +
          `Reply AGREE to create this custodial wallet, or DECLINE to stop. Reply HELP for these details again.`,
          `✅ Teléfono verificado. Antes de crear una billetera, revisa cómo funciona esta cuenta de WhatsApp.\n\n` +
          `NeuroWealth crea y opera una billetera de custodia en Stellar para ti. NeuroWealth guarda la clave de firma cifrada en sus servidores. Tú no controlas ni recibes la clave secreta. El servicio firma las transferencias que solicitas por WhatsApp.\n\n` +
          `La recuperación es limitada. Si el servicio pierde la clave o no puede verificar tu teléfono, es posible que no puedas recuperar el acceso. Protege tu número y contacta con soporte antes de cambiarlo. No envíes contraseñas, códigos de verificación ni claves secretas por chat.\n\n` +
          `Después de configurar la billetera, podrás pedir ayuda, consultar el saldo o las ganancias, depositar o retirar USDC y cambiar de estrategia. Para añadir fondos, primero crea la billetera y luego envía USDC por Stellar a la dirección que te indiquemos.\n\n` +
          `Responde AGREE para crear la billetera de custodia, DECLINE para cancelar o HELP para volver a ver estos detalles.`,
        ));
      } else {
        twiml.message(`❌ ${result.message}`);
      }
    } else {
      twiml.message(t(
        'Please enter the 6-digit verification code (digits only).',
        'Introduce el código de verificación de 6 dígitos (solo números).',
      ));
    }

    const outbound = twiml.toString();
    await logMessageToDb(phoneHash, 'outbound', outbound);
    res.type('text/xml').send(outbound);
    return;
  }

  if (session.state === UserState.AWAITING_CUSTODIAL_CONSENT) {
    const answer = messageBody.toLowerCase().trim();
    if (answer === 'help') {
      twiml.message(t(
        `This WhatsApp service uses a custodial Stellar wallet: NeuroWealth holds the encrypted signing key and signs transactions after your requests. Recovery can be limited if the key or verified phone access is lost. Once created, supported actions are balance, earnings, deposit USDC, withdraw USDC, and change strategy. Fund it by sending USDC on Stellar to the wallet address shown after setup.\n\nReply AGREE to create the wallet or DECLINE to stop.`,
        `Este servicio usa una billetera de custodia en Stellar. NeuroWealth guarda la clave de firma cifrada y firma las transacciones que solicitas. La recuperación puede ser limitada si se pierde la clave o el acceso al teléfono verificado. Una vez creada, podrás consultar el saldo y las ganancias, depositar o retirar USDC y cambiar de estrategia. Para añadir fondos, envía USDC por Stellar a la dirección que verás al finalizar la configuración.\n\nResponde AGREE para crear la billetera o DECLINE para cancelar.`,
      ));
    } else if (answer === 'agree' || answer === 'yes') {
      const wallet = createCustodialWallet(phoneHash);
      updateState(phoneHash, UserState.VERIFIED);
      twiml.message(t(
        `✅ Custodial wallet created on Stellar.\n` +
        `Wallet address: ${wallet.publicKey}\n\n` +
        `To fund it, send USDC on the Stellar network to this address. Check the network and token before sending; transfers on the wrong network or asset may be unrecoverable.\n\n` +
        `You can now ask for help, check your balance or earnings, deposit USDC, withdraw USDC, or change your strategy.`,
        `✅ Se creó tu billetera de custodia en Stellar.\n` +
        `Dirección de la billetera: ${wallet.publicKey}\n\n` +
        `Para añadir fondos, envía USDC por la red Stellar a esta dirección. Verifica la red y el activo antes de enviar. Las transferencias en otra red o de otro activo podrían ser irrecuperables.\n\n` +
        `Ya puedes pedir ayuda, consultar el saldo o las ganancias, depositar o retirar USDC y cambiar de estrategia.`,
      ));
    } else if (answer === 'decline' || answer === 'no') {
      updateState(phoneHash, UserState.UNVERIFIED);
      twiml.message(t(
        'No wallet was created. You can message START if you want to begin again.',
        'No se creó ninguna billetera. Envía START si quieres volver a empezar.',
      ));
    } else {
      twiml.message(t(
        'No wallet has been created yet. Reply AGREE to accept custodial wallet use, DECLINE to stop, or HELP for details.',
        'Aún no se ha creado una billetera. Responde AGREE para aceptar la custodia, DECLINE para cancelar o HELP para más información.',
      ));
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
      twiml.message(t(
        'Session expired. Send "hi" to re-verify.',
        'La sesión caducó. Envía "hi" para volver a verificarte.',
      ));
      const outbound = twiml.toString();
      await logMessageToDb(phoneHash, 'outbound', outbound);
      res.type('text/xml').send(outbound);
      return;
    }

    // Acknowledge immediately to stay within Twilio's 15 s window
    twiml.message(t(
      '⏳ Processing your request…',
      '⏳ Estamos procesando tu solicitud…',
    ));
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
      messageSid,
    }, {
      // MessageSid is provider-scoped and independent of mutable body/sender
      // fields, so a retried or altered delivery cannot create a second job.
      jobId: `twilio-${crypto.createHash('sha256').update(messageSid).digest('hex')}`,
    });
    return;
  }

  // Fallback
  twiml.message(t(
    'Something went wrong. Please send "hi" to start over.',
    'Ocurrió un error. Envía "hi" para empezar de nuevo.',
  ));
  res.type('text/xml').send(twiml.toString());
}

// ─────────────────────────────────────────────────────────
// Bull worker — processes intent jobs
// ─────────────────────────────────────────────────────────

intentQueue.process(INTENT_WORKER_CONCURRENCY, async (job) => {
  const { phoneHash, fromNumber, messageBody } = job.data;

  const locale = getSessionLocale(phoneHash);
  let replyText: string;
  if (!canExecuteIntent(phoneHash)) {
    replyText = translate(
      locale,
      'Session expired. Send "hi" to re-verify before requesting another transaction.',
      'La sesión caducó. Envía "hi" para volver a verificarte antes de solicitar otra transacción.',
    );
  } else try {
    replyText = await processVerifiedIntent(phoneHash, messageBody);
  } catch (err) {
    replyText = translate(
      locale,
      '❌ An error occurred. Please try again in a few moments.',
      '❌ Ocurrió un error. Vuelve a intentarlo en unos momentos.',
    );
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
  const locale = getSessionLocale(phoneHash);
  const t = (english: string, spanish: string) => translate(locale, english, spanish);
  const lower = messageBody.toLowerCase().trim();

  // Balance / portfolio
  if (
    lower.includes('balance') ||
    lower.includes('portfolio') ||
    lower.includes('how much') ||
    lower.includes('my account')
  ) {
    const portfolio = await getPortfolio(phoneHash);
    return t(
      `💰 Your NeuroWealth Portfolio\n\n` +
      `Balance: ${portfolio.balance.toFixed(2)} USDC ($${portfolio.usdEquivalent.toFixed(2)})\n` +
      `Earnings today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`,
      `💰 Tu cartera de NeuroWealth\n\n` +
      `Saldo: ${portfolio.balance.toFixed(2)} USDC ($${portfolio.usdEquivalent.toFixed(2)})\n` +
      `Ganancias de hoy: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `APY actual: ${portfolio.apy}%\n` +
      `Estrategia: ${portfolio.strategy}`,
    );
  }

  // Deposit
  const depositMatch = lower.match(/deposit\s+([\d.]+)/);
  if (depositMatch) {
    const amount = parseFloat(depositMatch[1]);
    const strategyMatch = lower.match(/\b(conservative|balanced|growth)\b/);
    const strategy = strategyMatch ? strategyMatch[1] : undefined;
    const result = await handleDeposit(phoneHash, amount, strategy, locale);
    return `🤖 ${result.message}`;
  }

  // Withdraw all
  if (
    lower.includes('withdraw all') ||
    lower.includes('withdraw everything')
  ) {
    const result = await handleWithdraw(phoneHash, undefined, true, locale);
    return `🤖 ${result.message}`;
  }

  // Withdraw amount
  const withdrawMatch = lower.match(/withdraw\s+([\d.]+)/);
  if (withdrawMatch) {
    const amount = parseFloat(withdrawMatch[1]);
    const result = await handleWithdraw(phoneHash, amount, false, locale);
    return `🤖 ${result.message}`;
  }

  // Strategy switch
  const stratMatch = lower.match(
    /switch\s+(?:to\s+)?(conservative|balanced|growth)/,
  );
  if (stratMatch) {
    const strat = stratMatch[1];
    return t(
      `✅ Strategy updated to ${strat.toUpperCase()}. The AI agent will rebalance on the next scheduled run.`,
      `✅ Estrategia cambiada a ${strat.toUpperCase()}. El agente hará el rebalanceo en la próxima ejecución programada.`,
    );
  }

  // Earnings
  if (lower.includes('earn') || lower.includes('yield') || lower.includes('apy')) {
    const portfolio = await getPortfolio(phoneHash);
    return t(
      `📈 Earnings Summary\n\n` +
      `Today: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `Current APY: ${portfolio.apy}%\n` +
      `Strategy: ${portfolio.strategy}`,
      `📈 Resumen de ganancias\n\n` +
      `Hoy: +$${portfolio.dailyEarnings.toFixed(2)}\n` +
      `APY actual: ${portfolio.apy}%\n` +
      `Estrategia: ${portfolio.strategy}`,
    );
  }

  // Greeting
  if (lower === 'hi' || lower === 'hello' || lower === 'help') {
    return t(
      `🤖 Hi! I'm your NeuroWealth AI Agent.\n\n` +
      `Commands:\n` +
      `• "balance" — view portfolio\n` +
      `• "deposit 100 USDC" — deposit funds\n` +
      `• "withdraw 50" — withdraw USDC\n` +
      `• "switch to growth" — change strategy\n` +
      `• "earnings" — view yield stats\n` +
      `• "language es" — switch to Spanish`,
      `🤖 ¡Hola! Soy tu agente de NeuroWealth.\n\n` +
      `Comandos:\n` +
      `• "balance" — consultar la cartera\n` +
      `• "deposit 100 USDC" — depositar fondos\n` +
      `• "withdraw 50" — retirar USDC\n` +
      `• "switch to growth" — cambiar de estrategia\n` +
      `• "earnings" — consultar las ganancias\n` +
      `• "language en" — cambiar a inglés`,
    );
  }

  return t(
    `I didn't quite catch that. Try:\n` +
    `• "deposit 50 USDC"\n` +
    `• "what's my balance"\n` +
    `• "withdraw all"\n` +
    `• "switch to conservative"`,
    `No entendí tu solicitud. Prueba con:\n` +
    `• "deposit 50 USDC"\n` +
    `• "balance"\n` +
    `• "withdraw all"\n` +
    `• "switch to conservative"`,
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
