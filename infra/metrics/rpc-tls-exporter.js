/**
 * RPC TLS certificate expiry exporter (Issue #788)
 *
 * Periodically probes the configured RPC endpoint(s), exposes the certificate
 * expiry as Prometheus metrics, and logs an actionable warning as renewal
 * approaches.
 *
 * Metrics (scraped from `GET /metrics`, default port 9469):
 *   neurowealth_rpc_tls_certificate_expiry_timestamp_seconds{endpoint}
 *       Unix timestamp of the certificate's notAfter date (last successful probe).
 *   neurowealth_rpc_tls_probe_success{endpoint}
 *       1 = the TLS handshake succeeded during the last probe, 0 = failed.
 *   neurowealth_rpc_tls_probe_duration_seconds{endpoint}
 *       Wall-clock duration of the last probe.
 *
 * Environment:
 *   RPC_TLS_ENDPOINTS            Comma-separated https:// RPC endpoints.
 *                                Falls back to SOROBAN_RPC_URL.
 *   RPC_TLS_EXPORTER_PORT        Listen port (default 9469).
 *   RPC_TLS_PROBE_INTERVAL_SECONDS  Probe interval (default 300).
 *   RPC_TLS_TIMEOUT_MS           Handshake timeout (default 5000).
 *   RPC_TLS_WARNING_DAYS         Warning threshold in days (default 21).
 *   RPC_TLS_CRITICAL_DAYS        Critical threshold in days (default 7).
 */

'use strict';

const http = require('node:http');
const client = require('prom-client');

const {
  DAY_SECONDS,
  DEFAULT_EXPIRY_THRESHOLDS,
  formatRemainingLifetime,
  parseEndpoints,
  probeCertificateExpiry,
} = require('./certificate-expiry');

const METRIC_PREFIX = 'neurowealth_rpc_tls';
const EXPIRY_METRIC = `${METRIC_PREFIX}_certificate_expiry_timestamp_seconds`;
const PROBE_SUCCESS_METRIC = `${METRIC_PREFIX}_probe_success`;
const PROBE_DURATION_METRIC = `${METRIC_PREFIX}_probe_duration_seconds`;

function identityLogger() {
  return { info() {}, warn() {}, error() {} };
}

/**
 * Build an isolated prom-client registry and the exporter's gauges.
 *
 * @returns {{
 *   registry: import('prom-client').Registry,
 *   expiry: import('prom-client').Gauge,
 *   probeSuccess: import('prom-client').Gauge,
 *   probeDuration: import('prom-client').Gauge,
 * }}
 */
function createMetrics() {
  const registry = new client.Registry();

  const expiry = new client.Gauge({
    name: EXPIRY_METRIC,
    help: 'Unix timestamp at which the RPC endpoint TLS certificate expires',
    labelNames: ['endpoint'],
    registers: [registry],
  });

  const probeSuccess = new client.Gauge({
    name: PROBE_SUCCESS_METRIC,
    help: 'Whether the last RPC TLS certificate probe succeeded (1) or failed (0)',
    labelNames: ['endpoint'],
    registers: [registry],
  });

  const probeDuration = new client.Gauge({
    name: PROBE_DURATION_METRIC,
    help: 'Duration in seconds of the last RPC TLS certificate probe',
    labelNames: ['endpoint'],
    registers: [registry],
  });

  return { registry, expiry, probeSuccess, probeDuration };
}

/**
 * Probe every endpoint once and update the gauges.
 *
 * @param {ReturnType<typeof createMetrics>} metrics
 * @param {{
 *   endpoints: string[],
 *   thresholds: { warningSeconds: number, criticalSeconds: number },
 *   timeoutMs: number,
 *   now?: number,
 *   logger?: { info: Function, warn: Function, error: Function },
 * }} config
 * @returns {Promise<Array<{ endpoint: string, success: boolean, error?: string, remainingSeconds?: number, severity?: string }>>}
 */
async function runProbeCycle(metrics, config) {
  const { endpoints, thresholds, timeoutMs, logger = identityLogger() } = config;
  const now = config.now ?? Date.now();

  const results = await Promise.all(
    endpoints.map(async (endpoint) => {
      const startedAt = Date.now();
      try {
        const result = await probeCertificateExpiry(endpoint, {
          timeoutMs,
          now,
          thresholds,
        });

        metrics.expiry.set({ endpoint }, result.notAfterMs / 1000);
        metrics.probeSuccess.set({ endpoint }, 1);
        metrics.probeDuration.set({ endpoint }, (Date.now() - startedAt) / 1000);

        const remaining = formatRemainingLifetime(result.remainingSeconds);

        if (result.severity === 'ok') {
          logger.info(
            `[rpc-tls] ${endpoint} certificate expires ${result.notAfter} (in ${remaining})`,
          );
        } else {
          logger.warn(
            `[rpc-tls] ${endpoint} certificate ${result.severity}: expires ${result.notAfter} ` +
              `(in ${remaining}). Renew the certificate with the RPC provider or ` +
              'switch SOROBAN_RPC_URL to a healthy endpoint before it expires.',
          );
        }

        return {
          endpoint,
          success: true,
          remainingSeconds: result.remainingSeconds,
          severity: result.severity,
        };
      } catch (error) {
        metrics.probeSuccess.set({ endpoint }, 0);
        metrics.probeDuration.set({ endpoint }, (Date.now() - startedAt) / 1000);

        logger.error(`[rpc-tls] ${endpoint} probe failed: ${error.message}`);
        return { endpoint, success: false, error: error.message };
      }
    }),
  );

  return results;
}

/**
 * Resolve exporter configuration from explicit options / environment.
 *
 * @param {Record<string, unknown>} [options]
 */
function resolveConfig(options = {}) {
  const env = process.env;

  const endpoints = Array.isArray(options.endpoints)
    ? options.endpoints.map((endpoint) => parseEndpoints(endpoint)[0]).filter(Boolean)
    : parseEndpoints(
        options.endpoints ??
          env.RPC_TLS_ENDPOINTS ??
          env.SOROBAN_RPC_URL,
      );

  if (endpoints.length === 0) {
    throw new Error(
      'No RPC endpoint configured. Set RPC_TLS_ENDPOINTS or SOROBAN_RPC_URL to an https:// URL.',
    );
  }

  const warningDays = Number(
    options.warningDays ?? env.RPC_TLS_WARNING_DAYS ?? DEFAULT_EXPIRY_THRESHOLDS.warningSeconds / DAY_SECONDS,
  );
  const criticalDays = Number(
    options.criticalDays ?? env.RPC_TLS_CRITICAL_DAYS ?? DEFAULT_EXPIRY_THRESHOLDS.criticalSeconds / DAY_SECONDS,
  );

  if (!Number.isFinite(warningDays) || !Number.isFinite(criticalDays)) {
    throw new Error('RPC TLS expiry thresholds must be finite numbers of days');
  }
  if (criticalDays < 0 || warningDays < criticalDays) {
    throw new Error('Require 0 <= RPC_TLS_CRITICAL_DAYS <= RPC_TLS_WARNING_DAYS');
  }

  return {
    endpoints,
    thresholds: {
      warningSeconds: warningDays * DAY_SECONDS,
      criticalSeconds: criticalDays * DAY_SECONDS,
    },
    timeoutMs: Number(options.timeoutMs ?? env.RPC_TLS_TIMEOUT_MS ?? 5000),
    intervalMs:
      Number(options.intervalMs ?? (Number(env.RPC_TLS_PROBE_INTERVAL_SECONDS ?? 300) * 1000)),
    port: Number(options.port ?? env.RPC_TLS_EXPORTER_PORT ?? 9469),
    logger: options.logger ?? console,
  };
}

/**
 * Start the exporter. Probe results are published before the server is usable
 * so Prometheus never sees an empty registry on startup.
 *
 * @param {Record<string, unknown>} [options]
 * @returns {Promise<{
 *   server: import('node:http').Server,
 *   port: number,
 *   metrics: ReturnType<typeof createMetrics>,
 *   results: Awaited<ReturnType<typeof runProbeCycle>>,
 *   probeOnce: () => Promise<Awaited<ReturnType<typeof runProbeCycle>>>,
 *   stop: () => Promise<void>,
 * }>}
 */
async function startExporter(options = {}) {
  const config = resolveConfig(options);
  const metrics = createMetrics();

  let latestResults = await runProbeCycle(metrics, config);

  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': metrics.registry.contentType });
      res.end(await metrics.registry.metrics());
      return;
    }

    if (req.url === '/healthz') {
      const healthy = latestResults.every((result) => result.success);
      res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: healthy ? 'ok' : 'degraded',
          endpoints: config.endpoints,
          results: latestResults,
        }),
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Use /metrics or /healthz.\n');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const probeOnce = async () => {
    latestResults = await runProbeCycle(metrics, config);
    return latestResults;
  };

  const timer =
    config.intervalMs > 0
      ? setInterval(() => {
          probeOnce().catch((error) => {
            config.logger.error(`[rpc-tls] probe cycle failed: ${error.message}`);
          });
        }, config.intervalMs)
      : null;
  timer?.unref?.();

  const stop = async () => {
    if (timer) clearInterval(timer);
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  };

  return {
    server,
    port: server.address().port,
    metrics,
    results: latestResults,
    probeOnce,
    stop,
  };
}

async function main() {
  let exporter;
  try {
    exporter = await startExporter();
  } catch (error) {
    console.error(`[rpc-tls] failed to start exporter: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[rpc-tls] exporter listening on :${exporter.port}; probing ${exporter.results.length} endpoint(s)`,
  );

  const shutdown = async (signal) => {
    console.log(`[rpc-tls] received ${signal}, shutting down`);
    await exporter.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPIRY_METRIC,
  PROBE_SUCCESS_METRIC,
  PROBE_DURATION_METRIC,
  createMetrics,
  runProbeCycle,
  resolveConfig,
  startExporter,
};
