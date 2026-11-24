/**
 * RPC TLS certificate expiry probe (Issue #788)
 *
 * Reads the `notAfter` date of the certificate an RPC endpoint presents during
 * the TLS handshake and converts it into a remaining lifetime so operators get
 * advance warning before renewal is due.
 *
 * The handshake deliberately uses `rejectUnauthorized: false`: the goal is to
 * observe the certificate's expiry, not to re-validate the chain (Prometheus
 * blackbox-style probes would treat an already-expired certificate as a failed
 * probe and hide the metric we need). Chain/hostname validation belongs to the
 * RPC client.
 *
 * Dependency-free (Node.js core `tls` only) so it can be unit tested and used
 * as a preflight check without installing anything.
 */

'use strict';

const net = require('node:net');
const tls = require('node:tls');
const { URL } = require('node:url');

const DAY_SECONDS = 24 * 60 * 60;

/** Default thresholds: warn at 21 days remaining, page at 7 days. */
const DEFAULT_EXPIRY_THRESHOLDS = Object.freeze({
  warningSeconds: 21 * DAY_SECONDS,
  criticalSeconds: 7 * DAY_SECONDS,
});

/**
 * Parse a comma-separated endpoint list into normalised `https://host[:port]`
 * origins. Empty entries and duplicates are dropped; the order is preserved.
 *
 * @param {string|undefined|null} raw
 * @returns {string[]}
 */
function parseEndpoints(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const seen = new Set();
  const endpoints = [];

  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const { endpoint } = normalizeEndpoint(trimmed);
    if (seen.has(endpoint)) continue;

    seen.add(endpoint);
    endpoints.push(endpoint);
  }

  return endpoints;
}

/**
 * Validate and normalise a single RPC endpoint.
 *
 * @param {string} endpoint
 * @returns {{ endpoint: string, hostname: string, port: number }}
 */
function normalizeEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch (error) {
    throw new Error(`Invalid RPC endpoint "${endpoint}": ${error.message}`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `RPC TLS certificate probe requires an https:// endpoint, received "${endpoint}"`,
    );
  }

  // Certificates are bound to host/port, not to the JSON-RPC path.
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = url.port ? Number(url.port) : 443;

  return { endpoint: url.origin, hostname, port };
}

/**
 * Classify the remaining certificate lifetime.
 *
 * @param {number} remainingSeconds
 * @param {{ warningSeconds?: number, criticalSeconds?: number }} [thresholds]
 * @returns {'ok'|'warning'|'critical'|'expired'}
 */
function classifyCertificateExpiry(remainingSeconds, thresholds = {}) {
  if (!Number.isFinite(remainingSeconds)) {
    throw new TypeError('remainingSeconds must be a finite number');
  }

  const warningSeconds =
    thresholds.warningSeconds ?? DEFAULT_EXPIRY_THRESHOLDS.warningSeconds;
  const criticalSeconds =
    thresholds.criticalSeconds ?? DEFAULT_EXPIRY_THRESHOLDS.criticalSeconds;

  if (remainingSeconds <= 0) return 'expired';
  if (remainingSeconds <= criticalSeconds) return 'critical';
  if (remainingSeconds <= warningSeconds) return 'warning';
  return 'ok';
}

/**
 * Human-readable remaining lifetime, e.g. `"18d 4h"` or `"expired 2h ago"`.
 *
 * @param {number} remainingSeconds
 * @returns {string}
 */
function formatRemainingLifetime(remainingSeconds) {
  const expired = remainingSeconds <= 0;
  let seconds = Math.abs(Math.round(remainingSeconds));

  const days = Math.floor(seconds / DAY_SECONDS);
  seconds -= days * DAY_SECONDS;
  const hours = Math.floor(seconds / 3600);

  const duration =
    days > 0 ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;

  return expired ? `expired ${duration} ago` : duration;
}

/**
 * Open a TLS connection and return the leaf certificate presented by `target`.
 *
 * @param {{ hostname: string, port: number }} target
 * @param {number} timeoutMs
 * @returns {Promise<import('node:tls').PeerCertificate>}
 */
function getPeerCertificate({ hostname, port }, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port,
      // SNI must not carry an IP literal.
      servername: net.isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: false,
    });

    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs, () => {
      fail(
        new Error(
          `TLS handshake with ${hostname}:${port} timed out after ${timeoutMs}ms`,
        ),
      );
    });

    socket.once('error', (error) => {
      fail(new Error(`TLS handshake with ${hostname}:${port} failed: ${error.message}`));
    });

    socket.once('secureConnect', () => {
      const certificate = socket.getPeerCertificate();
      if (!certificate || !certificate.valid_to) {
        fail(new Error(`No TLS certificate presented by ${hostname}:${port}`));
        return;
      }
      settled = true;
      socket.end();
      resolve(certificate);
    });
  });
}

/**
 * Probe one RPC endpoint and report the remaining certificate lifetime.
 *
 * @param {string} endpoint
 * @param {{ timeoutMs?: number, now?: number, thresholds?: { warningSeconds?: number, criticalSeconds?: number } }} [options]
 * @returns {Promise<{
 *   endpoint: string,
 *   hostname: string,
 *   port: number,
 *   notAfter: string,
 *   notAfterMs: number,
 *   remainingSeconds: number,
 *   severity: 'ok'|'warning'|'critical'|'expired',
 * }>}
 */
async function probeCertificateExpiry(endpoint, options = {}) {
  const {
    timeoutMs = 5000,
    now = Date.now(),
    thresholds = DEFAULT_EXPIRY_THRESHOLDS,
  } = options;

  const target = normalizeEndpoint(endpoint);
  const certificate = await getPeerCertificate(target, timeoutMs);

  const notAfterMs = Date.parse(certificate.valid_to);
  if (!Number.isFinite(notAfterMs)) {
    throw new Error(
      `TLS certificate for ${target.endpoint} has an unparseable notAfter date: "${certificate.valid_to}"`,
    );
  }

  const remainingSeconds = Math.round((notAfterMs - now) / 1000);

  return {
    endpoint: target.endpoint,
    hostname: target.hostname,
    port: target.port,
    notAfter: new Date(notAfterMs).toISOString(),
    notAfterMs,
    remainingSeconds,
    severity: classifyCertificateExpiry(remainingSeconds, thresholds),
  };
}

module.exports = {
  DAY_SECONDS,
  DEFAULT_EXPIRY_THRESHOLDS,
  parseEndpoints,
  normalizeEndpoint,
  classifyCertificateExpiry,
  formatRemainingLifetime,
  probeCertificateExpiry,
};
