/**
 * Tests for the RPC TLS certificate expiry probe (Issue #788).
 *
 * Uses a controlled endpoint: a local HTTPS server with a freshly generated,
 * short-lived self-signed certificate. No network access or external CA needed.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const {
  DAY_SECONDS,
  DEFAULT_EXPIRY_THRESHOLDS,
  classifyCertificateExpiry,
  formatRemainingLifetime,
  normalizeEndpoint,
  parseEndpoints,
  probeCertificateExpiry,
} = require('./certificate-expiry.js');

/** @type {string} */
let workDir;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'rpc-tls-test-'));
});

after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Generate a self-signed certificate that expires in `days` days.
 *
 * @param {string} name
 * @param {number} days
 * @returns {{ key: Buffer, cert: Buffer }}
 */
function generateCertificate(name, days) {
  const keyPath = join(workDir, `${name}-key.pem`);
  const certPath = join(workDir, `${name}-cert.pem`);

  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    String(days),
    '-subj',
    '/CN=localhost',
  ], { stdio: 'ignore' });

  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

/**
 * Start a controlled HTTPS endpoint with the given certificate.
 *
 * @param {{ key: Buffer, cert: Buffer }} credentials
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
async function startControlledEndpoint(credentials) {
  const server = https.createServer(credentials, (_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const { port } = server.address();

  return {
    url: `https://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('probeCertificateExpiry', () => {
  it('reports the remaining lifetime of a short-lived certificate', async () => {
    const endpoint = await startControlledEndpoint(generateCertificate('short', 2));
    const startedAt = Date.now();

    try {
      const result = await probeCertificateExpiry(endpoint.url);

      assert.equal(result.endpoint, endpoint.url);
      assert.equal(result.port, Number(new URL(endpoint.url).port));
      assert.ok(Number.isFinite(result.notAfterMs));

      // Roughly two days remain; allow the handshake/fixture skew.
      assert.ok(
        result.remainingSeconds > 1.5 * DAY_SECONDS &&
          result.remainingSeconds <= 2 * DAY_SECONDS,
        `expected ~2 days remaining, got ${result.remainingSeconds}s`,
      );
      assert.ok(result.notAfterMs > startedAt + 1.5 * DAY_SECONDS * 1000);

      // Two days is inside the default 7-day critical threshold.
      assert.equal(result.severity, 'critical');
    } finally {
      await endpoint.close();
    }
  });

  it('classifies a healthy certificate as ok', async () => {
    const endpoint = await startControlledEndpoint(generateCertificate('long', 365));

    try {
      const result = await probeCertificateExpiry(endpoint.url);
      assert.equal(result.severity, 'ok');
    } finally {
      await endpoint.close();
    }
  });

  it('rejects when the endpoint is not reachable', async () => {
    const endpoint = await startControlledEndpoint(generateCertificate('closed', 30));
    await endpoint.close();

    await assert.rejects(
      () => probeCertificateExpiry(endpoint.url, { timeoutMs: 1000 }),
      /TLS handshake/,
    );
  });

  it('rejects non-https endpoints', async () => {
    await assert.rejects(
      () => probeCertificateExpiry('http://127.0.0.1:8080'),
      /requires an https:\/\//,
    );
  });
});

describe('classifyCertificateExpiry', () => {
  const { warningSeconds, criticalSeconds } = DEFAULT_EXPIRY_THRESHOLDS;

  it('maps remaining lifetime to an actionable severity', () => {
    assert.equal(classifyCertificateExpiry(-1), 'expired');
    assert.equal(classifyCertificateExpiry(0), 'expired');
    assert.equal(classifyCertificateExpiry(criticalSeconds), 'critical');
    assert.equal(classifyCertificateExpiry(criticalSeconds - 1), 'critical');
    assert.equal(classifyCertificateExpiry(criticalSeconds + 1), 'warning');
    assert.equal(classifyCertificateExpiry(warningSeconds), 'warning');
    assert.equal(classifyCertificateExpiry(warningSeconds + 1), 'ok');
  });

  it('honours custom thresholds', () => {
    const thresholds = { warningSeconds: 3 * DAY_SECONDS, criticalSeconds: DAY_SECONDS };
    assert.equal(classifyCertificateExpiry(2 * DAY_SECONDS, thresholds), 'warning');
    assert.equal(classifyCertificateExpiry(0.5 * DAY_SECONDS, thresholds), 'critical');
  });
});

describe('endpoint parsing', () => {
  it('normalises, deduplicates and preserves https endpoints', () => {
    assert.deepEqual(
      parseEndpoints(
        ' https://soroban-testnet.stellar.org , https://soroban-testnet.stellar.org:443/, https://rpc.example.com/path ',
      ),
      ['https://soroban-testnet.stellar.org', 'https://rpc.example.com'],
    );
  });

  it('extracts hostname and port', () => {
    assert.deepEqual(normalizeEndpoint('https://rpc.example.com:8443/x'), {
      endpoint: 'https://rpc.example.com:8443',
      hostname: 'rpc.example.com',
      port: 8443,
    });
  });

  it('ignores empty input', () => {
    assert.deepEqual(parseEndpoints(undefined), []);
    assert.deepEqual(parseEndpoints(''), []);
    assert.deepEqual(parseEndpoints(' , '), []);
  });
});

describe('formatRemainingLifetime', () => {
  it('renders days and hours', () => {
    assert.equal(formatRemainingLifetime(2 * DAY_SECONDS + 3600), '2d 1h');
    assert.equal(formatRemainingLifetime(-3600), 'expired 1h 0m ago');
  });
});
