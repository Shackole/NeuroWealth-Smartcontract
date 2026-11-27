# infra/metrics — Agent Prometheus Metrics

This directory contains the Prometheus instrumentation for the NeuroWealth AI
agent service.

For configured retention periods and storage limits across Prometheus,
container logs, CloudWatch, CI artifacts, and backups, see
[`../RETENTION.md`](../RETENTION.md).

## Integration

Install the dependency in the agent package:

```bash
npm install prom-client@15.1.0 --save-exact
```

In your agent entry point (`agent/index.js` or `agent/index.ts`):

```js
const express = require('express');
const {
  metricsRouter,
  requestMetricsMiddleware,
  recordRebalance,
  setQueueDepth,
  updateVaultSnapshot,
  recordDepositEvent,
  recordWithdrawEvent,
  recordAssetsUpdatedEvent,
  recordDecisionLoopComplete,
  recordAgentError,
  recordRpcLatency,
} = require('../infra/metrics/metrics');

const app = express();

// Record latency and error rate for every route
app.use(requestMetricsMiddleware);

// Expose /metrics for Prometheus scraping
app.use(metricsRouter);

// Instrument the decision loop
async function runDecisionLoop() {
  const start = Date.now();
  try {
    await doRebalanceLogic();
    recordDecisionLoopComplete((Date.now() - start) / 1000);
  } catch (err) {
    recordAgentError('decision_loop');
    throw err;
  }
}

// Instrument rebalances
async function callRebalance(protocol) {
  const start = Date.now();
  const result = await vault.rebalance(protocol, expectedApy, minOut);
  recordRebalance(protocol, result.status, (Date.now() - start) / 1000);
}

// Update on-chain gauges after each ledger poll
async function pollVaultState() {
  const snapshot = await vault.getSnapshot();    // { totalAssets, totalShares, isPaused, ... }
  updateVaultSnapshot(snapshot);
}

// Record vault events from the Horizon stream
horizonStream.on('deposit', ({ amount }) => recordDepositEvent(amount));
horizonStream.on('withdraw', ({ amount }) => recordWithdrawEvent(amount));
horizonStream.on('assetsUpdated', ({ oldTotal, newTotal }) =>
  recordAssetsUpdatedEvent(BigInt(oldTotal), BigInt(newTotal))
);

app.listen(3000, () => console.log('Agent listening on :3000, metrics at /metrics'));
```

## Metrics Reference

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request latency (p50/p95/p99) |
| `http_errors_total` | Counter | `method`, `route`, `status_code` | 4xx/5xx responses |
| `queue_depth` | Gauge | `queue_name` | Bull queue waiting jobs |
| `queue_completed_total` | Counter | `queue_name` | Completed queue jobs |
| `queue_failed_total` | Counter | `queue_name` | Failed queue jobs |
| `rebalance_total` | Counter | `protocol`, `status` | Rebalance operations |
| `rebalance_duration_seconds` | Histogram | `protocol` | Rebalance round-trip time |
| `stellar_rpc_latency_seconds` | Histogram | `operation` | Stellar RPC call latency |
| `stellar_rpc_errors_total` | Counter | `operation`, `error_type` | Stellar RPC errors |
| `neurowealth_vault_total_assets` | Gauge | — | Vault TVL in stroops |
| `neurowealth_vault_total_shares` | Gauge | — | Total shares in circulation |
| `neurowealth_vault_share_price_usdc` | Gauge | — | Share price (assets/shares) |
| `neurowealth_vault_deposit_events_total` | Counter | — | Deposit events observed |
| `neurowealth_vault_withdraw_events_total` | Counter | — | Withdraw events observed |
| `neurowealth_vault_deposit_amount_total` | Counter | — | Cumulative USDC deposited |
| `neurowealth_vault_withdraw_amount_total` | Counter | — | Cumulative USDC withdrawn |
| `neurowealth_vault_assets_updated_decrease_total` | Counter | — | Assets-update decrease events |
| `neurowealth_vault_assets_updated_decrease_stroops_total` | Counter | — | Total stroops decreased |
| `neurowealth_vault_paused` | Gauge | — | 1 = paused, 0 = active |
| `neurowealth_vault_consecutive_failures` | Gauge | — | Circuit breaker counter |
| `agent_decision_loop_duration_seconds` | Histogram | — | Decision loop runtime |
| `agent_errors_total` | Counter | `type` | Agent-level errors by type |
| `agent_last_decision_loop_timestamp_seconds` | Gauge | — | Epoch of last loop (for down alert) |

All default `prom-client` Node.js process metrics are also included with the
prefix `neurowealth_agent_`.

## Prometheus Scrape Config

See [`infra/prometheus.yml`](../prometheus.yml) for the Prometheus job
configuration that scrapes this endpoint.

## RPC TLS Certificate Expiry Exporter (#788)

[`rpc-tls-exporter.js`](rpc-tls-exporter.js) probes each configured Soroban RPC
endpoint over TLS, exposes the certificate expiry for Prometheus, and logs an
actionable warning as renewal approaches. It is independent of the Agent
process and can run as its own service (see
[`docker-compose.monitoring.yml`](../docker-compose.monitoring.yml)) or locally:

```bash
cd infra/metrics
npm install
RPC_TLS_ENDPOINTS="https://soroban-testnet.stellar.org" npm run exporter
curl -s http://127.0.0.1:9469/metrics | grep neurowealth_rpc_tls
```

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `neurowealth_rpc_tls_certificate_expiry_timestamp_seconds` | Gauge | `endpoint` | Certificate `notAfter` as a Unix timestamp (last successful probe) |
| `neurowealth_rpc_tls_probe_success` | Gauge | `endpoint` | 1 = TLS handshake succeeded, 0 = probe failed |
| `neurowealth_rpc_tls_probe_duration_seconds` | Gauge | `endpoint` | Duration of the last probe |

| Variable | Default | Description |
| --- | --- | --- |
| `RPC_TLS_ENDPOINTS` | `SOROBAN_RPC_URL` | Comma-separated `https://` endpoints to probe |
| `RPC_TLS_EXPORTER_PORT` | `9469` | HTTP listen port (`/metrics`, `/healthz`) |
| `RPC_TLS_PROBE_INTERVAL_SECONDS` | `300` | Probe interval |
| `RPC_TLS_TIMEOUT_MS` | `5000` | TLS handshake timeout |
| `RPC_TLS_WARNING_DAYS` | `21` | Warning threshold (logged and used by alert rules) |
| `RPC_TLS_CRITICAL_DAYS` | `7` | Critical threshold |

Alert rules live in the `rpc_tls_certificate` group of
[`../rules/neurowealth_alerts.yml`](../rules/neurowealth_alerts.yml); response
steps are in [`docs/monitoring.md`](../../docs/monitoring.md#16-rpc-tls-certificate-expiry).

Tests run the probe and exporter against a controlled endpoint (a local HTTPS
server with a freshly generated short-lived certificate):

```bash
cd infra/metrics && npm test
```
