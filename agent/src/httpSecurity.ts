import express from 'express';
import type { Express } from 'express';
import type { Server } from 'http';

const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT ?? '1mb';

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

/**
 * Trust forwarding headers only from explicitly configured proxy addresses or
 * CIDRs. An empty setting keeps Express's safe default (`trust proxy: false`).
 */
export function configureHttpSecurity(app: Express): void {
  const trustedProxyCidrs = (process.env.TRUSTED_PROXY_CIDRS ?? '')
    .split(',')
    .map((cidr) => cidr.trim())
    .filter(Boolean);

  app.set('trust proxy', trustedProxyCidrs.length > 0 ? trustedProxyCidrs : false);
  app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
}

/** Configure bounded HTTP request/header/keep-alive timeouts on the server. */
export function configureHttpTimeouts(server: Server): void {
  const requestTimeout = positiveInteger(
    process.env.HTTP_REQUEST_TIMEOUT_MS,
    30_000,
    'HTTP_REQUEST_TIMEOUT_MS',
  );
  const headersTimeout = positiveInteger(
    process.env.HTTP_HEADERS_TIMEOUT_MS,
    10_000,
    'HTTP_HEADERS_TIMEOUT_MS',
  );
  const keepAliveTimeout = positiveInteger(
    process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
    5_000,
    'HTTP_KEEP_ALIVE_TIMEOUT_MS',
  );

  if (headersTimeout > requestTimeout) {
    throw new Error('HTTP_HEADERS_TIMEOUT_MS must not exceed HTTP_REQUEST_TIMEOUT_MS');
  }

  server.requestTimeout = requestTimeout;
  server.headersTimeout = headersTimeout;
  server.keepAliveTimeout = keepAliveTimeout;
}
