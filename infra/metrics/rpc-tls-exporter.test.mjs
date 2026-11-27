/**
 * Tests for the RPC TLS certificate expiry exporter (Issue #788).
 *
 * Exercises the real Prometheus exposition output against a controlled HTTPS
 * endpoint serving a short-lived certificate.
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
const { DAY_SECONDS } = require('./certificate-expiry.js');
const {
  EXPIRY_METRIC,
  PROBE_SUCCESS_METRIC,
  startExporter,
} = require('./rpc-tls-exporter.js');

const silentLogger = { info() {}, warn() {}, error() {} };

/** @type {string} */
let workDir;
/** @type {{ key: Buffer, cert: Buffer }} */
let credentials;

before(() => {
  workDir = mkdtempSync(join(tmpdir(), 'rpc-tls-exporter-test-'));

  const keyPath = join(workDir, 'key.pem');
  const certPath = join(workDir, 'cert.pem');
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
    '5',
    '-subj',
    '/CN=localhost',
  ], { stdio: 'ignore' });
  credentials = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
});

after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

async function startControlledEndpoint() {
  const server = https.createServer(credentials, (_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `https://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Fetch a path from the exporter as plain text. */
async function fetchExporter(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: response.status, body: await response.text() };
}

describe('rpc tls exporter', () => {
  it('exposes certificate expiry and probe status for a controlled endpoint', async () => {
    const endpoint = await startControlledEndpoint();
    const exporter = await startExporter({
      endpoints: [endpoint.url],
      port: 0,
      intervalMs: 0,
      timeoutMs: 2000,
      logger: silentLogger,
    });

    try {
      const before = Date.now() / 1000;
      const { status, body } = await fetchExporter(exporter.port, '/metrics');

      assert.equal(status, 200);

      const expiryLine = body
        .split('\n')
        .find((line) => line.startsWith(`${EXPIRY_METRIC}{`));
      assert.ok(expiryLine, `expected ${EXPIRY_METRIC} in exposition output`);

      const match = expiryLine.match(
        new RegExp(`${EXPIRY_METRIC}\\{endpoint="${endpoint.url}"\\} ([0-9.]+)`),
      );
      assert.ok(match, `unexpected exposition line: ${expiryLine}`);

      const expiry = Number(match[1]);
      // The certificate is valid for 5 days, so expiry must be ~5 days out.
      assert.ok(expiry > before + 4 * DAY_SECONDS, `unexpected expiry ${expiry}`);
      assert.ok(expiry < before + 6 * DAY_SECONDS, `unexpected expiry ${expiry}`);

      const successLine = body
        .split('\n')
        .find((line) => line.startsWith(`${PROBE_SUCCESS_METRIC}{`));
      assert.ok(successLine, `expected ${PROBE_SUCCESS_METRIC}`);
      assert.match(successLine, / 1$/);

      const health = await fetchExporter(exporter.port, '/healthz');
      assert.equal(health.status, 200);
      assert.equal(JSON.parse(health.body).status, 'ok');
    } finally {
      await exporter.stop();
      await endpoint.close();
    }
  });

  it('reports a failed probe when the endpoint is unreachable', async () => {
    const endpoint = await startControlledEndpoint();
    const exporter = await startExporter({
      endpoints: [endpoint.url],
      port: 0,
      intervalMs: 0,
      timeoutMs: 1000,
      logger: silentLogger,
    });

    try {
      await endpoint.close();
      await exporter.probeOnce();

      const { body } = await fetchExporter(exporter.port, '/metrics');
      const successLine = body
        .split('\n')
        .find((line) => line.startsWith(`${PROBE_SUCCESS_METRIC}{`));
      assert.ok(successLine);
      assert.match(successLine, / 0$/);

      const health = await fetchExporter(exporter.port, '/healthz');
      assert.equal(health.status, 503);
      assert.equal(JSON.parse(health.body).status, 'degraded');
    } finally {
      await exporter.stop();
    }
  });

  it('requires at least one https endpoint', async () => {
    await assert.rejects(
      () => startExporter({ endpoints: [], port: 0, logger: silentLogger }),
      /No RPC endpoint configured/,
    );
    await assert.rejects(
      () =>
        startExporter({
          endpoints: ['http://127.0.0.1:8080'],
          port: 0,
          logger: silentLogger,
        }),
      /requires an https:\/\//,
    );
  });
});
