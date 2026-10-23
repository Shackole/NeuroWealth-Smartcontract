/**
 * Structured JSON logger for NeuroWealth agent (Issue #121).
 *
 * Features:
 *  - pino structured JSON output with fixed base fields: timestamp, level,
 *    service, version, message
 *  - Sensitive field redaction via pino-redact (secret keys, phone numbers,
 *    partial wallet addresses). Falls back gracefully if pino-redact is not
 *    installed.
 *  - Datadog transport when DD_API_KEY is set and pino-datadog-transport is
 *    installed. Falls back to stdout JSON.
 *  - Development: pretty-print via pino-pretty if installed; else plain JSON.
 *  - Exports createRequestLogger(requestId, userId?) for per-request child
 *    loggers with hashed userId.
 *  - Exports asyncLocalStorage for request-context propagation.
 *
 * Log levels (controlled by LOG_LEVEL env var):
 *   debug  — verbose, development only
 *   info   — default in production
 *   warn   — degraded but non-fatal condition
 *   error  — error with stack trace and request context
 */

import pino, { Logger, LoggerOptions } from 'pino';
import { createHash } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------

const SERVICE_NAME = process.env.SERVICE_NAME ?? 'neurowealth-agent';
const SERVICE_VERSION = process.env.npm_package_version ?? '1.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL ?? (IS_PRODUCTION ? 'info' : 'debug');

// ---------------------------------------------------------------------------
// Sensitive field redaction paths
// ---------------------------------------------------------------------------

const REDACT_PATHS = [
  'secret',
  'secretKey',
  'privateKey',
  'password',
  'token',
  'mnemonic',
  'seed',
  'phone',
  'phoneNumber',
  '*.secret',
  '*.secretKey',
  '*.privateKey',
  '*.password',
  '*.token',
  '*.mnemonic',
  '*.seed',
  '*.phone',
  '*.phoneNumber',
  // Partial wallet address redaction handled by serialiser below
];

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

function buildTransport(): LoggerOptions['transport'] | undefined {
  if (IS_PRODUCTION) {
    // Prefer Datadog transport when DD_API_KEY is configured
    if (process.env.DD_API_KEY) {
      try {
        // Dynamic require — pino-datadog-transport is an optional peer dep
        require.resolve('pino-datadog-transport');
        return {
          target: 'pino-datadog-transport',
          options: {
            ddApiKey: process.env.DD_API_KEY,
            ddClientConf: { intakeRegion: process.env.DD_SITE ?? 'us1' },
            service: SERVICE_NAME,
            ddtags: `env:${process.env.NODE_ENV ?? 'production'},version:${SERVICE_VERSION}`,
          },
        };
      } catch {
        // pino-datadog-transport not installed; fall through to stdout JSON
      }
    }
    // Production without Datadog: emit plain JSON to stdout
    return undefined;
  }

  // Development: pretty-print if available
  try {
    require.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    };
  } catch {
    // pino-pretty not installed; emit plain JSON to stdout in dev
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Redact configuration
// ---------------------------------------------------------------------------

function buildRedactOptions(): LoggerOptions['redact'] {
  try {
    require.resolve('pino-redact');
    // pino natively supports redact without pino-redact package;
    // this guard is kept for future explicit pino-redact usage.
  } catch {
    // intentional no-op
  }
  return {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  };
}

// ---------------------------------------------------------------------------
// Wallet address serialiser (redact all but first 4 + last 4 chars)
// ---------------------------------------------------------------------------

function maskWalletAddress(addr: unknown): unknown {
  if (typeof addr !== 'string' || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Root logger construction
// ---------------------------------------------------------------------------

const loggerOptions: LoggerOptions = {
  level: LOG_LEVEL,
  base: {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
    bindings(bindings) {
      return { pid: bindings.pid, host: bindings.hostname };
    },
  },
  redact: buildRedactOptions(),
  serializers: {
    walletAddress: maskWalletAddress,
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  transport: buildTransport(),
};

const logger: Logger = pino(loggerOptions);

// ---------------------------------------------------------------------------
// AsyncLocalStorage for request-context propagation
// ---------------------------------------------------------------------------

export interface RequestContext {
  requestId: string;
  /** Optional hashed user identifier (first 16 hex chars of SHA-256). */
  userId?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// ---------------------------------------------------------------------------
// Per-request child logger factory
// ---------------------------------------------------------------------------

/**
 * Returns a child logger bound to the given requestId and (hashed) userId.
 *
 * Usage in route handlers:
 *   const reqLogger = createRequestLogger(req.headers['x-request-id'], userId);
 *   reqLogger.info({ action: 'deposit' }, 'Processing deposit');
 */
export function createRequestLogger(requestId: string, userId?: string): Logger {
  const bindings: Record<string, string> = { requestId };
  if (userId) {
    // Hash userId: first 16 hex chars of SHA-256 (pseudonymous, not reversible)
    bindings.userId = createHash('sha256').update(userId).digest('hex').slice(0, 16);
  }
  return logger.child(bindings);
}

/**
 * Returns the requestId from AsyncLocalStorage, or 'unknown' if not in a
 * request context.
 */
export function getRequestId(): string {
  return asyncLocalStorage.getStore()?.requestId ?? 'unknown';
}

export default logger;
