# Structured Logging

**Issue:** [#121](https://github.com/Shackole/NeuroWealth-Smartcontract/issues/121)

This document describes the structured logging approach for the NeuroWealth agent
backend, including log fields, levels, sensitive-field redaction, Datadog shipping,
and log-based alerting.

---

## Overview

All backend log statements use structured JSON format via [pino](https://github.com/pinojs/pino)
— the fastest JSON logger for Node.js. Every log line is a single JSON object
with a fixed set of base fields, making logs machine-parseable and easily
queryable in Datadog or Grafana Loki.

---

## Log Fields Reference

| Field | Type | Description |
|-------|------|-------------|
| `time` | ISO 8601 string | UTC timestamp of the log event |
| `level` | string | Log level: `debug`, `info`, `warn`, `error` |
| `service` | string | Always `neurowealth-agent` (or `SERVICE_NAME` env) |
| `version` | string | Package version from `npm_package_version` |
| `pid` | number | Process ID |
| `host` | string | Hostname |
| `requestId` | string | UUID v4, present on all logs within a request context |
| `userId` | string | First 16 hex chars of SHA-256(userId) — pseudonymous |
| `message` / `msg` | string | Human-readable log message |
| `err` / `error` | object | Serialised Error with `message`, `stack`, `type` |
| _metadata_ | any | Additional key-value pairs specific to the operation |

### Example log lines

```json
{"time":"2026-09-27T12:00:00.000Z","level":"info","service":"neurowealth-agent","version":"1.0.0","requestId":"a3f2...","msg":"Processing deposit","amount":5000000,"protocol":"blend"}

{"time":"2026-09-27T12:00:01.000Z","level":"error","service":"neurowealth-agent","version":"1.0.0","requestId":"a3f2...","err":{"type":"Error","message":"RPC timeout","stack":"Error: RPC timeout\n    at ..."},"msg":"Rebalance failed"}
```

---

## Log Levels

| Level | When to use | Production default |
|-------|-------------|-------------------|
| `debug` | Verbose tracing, loop internals, intermediate values | Off (set `LOG_LEVEL=debug` to enable) |
| `info` | Normal operational events: deposits, rebalances, decisions | ✅ On |
| `warn` | Degraded but non-fatal: circuit breaker open, retry triggered | ✅ On |
| `error` | Failures requiring attention: RPC error, DB failure, unhandled exception | ✅ On |

Control via `LOG_LEVEL` environment variable.

---

## Sensitive Field Redaction

The following fields are automatically redacted to `[REDACTED]` by pino's built-in
`redact` option (configured in `agent/src/logger.ts`):

| Field pattern | Example value redacted |
|---------------|----------------------|
| `secret`, `*.secret` | Agent signing key |
| `secretKey`, `*.secretKey` | Stellar keypair secret |
| `privateKey`, `*.privateKey` | Any private key |
| `password`, `*.password` | Database passwords |
| `token`, `*.token` | Auth tokens, JWTs |
| `mnemonic`, `*.mnemonic` | BIP-39 seed phrases |
| `seed`, `*.seed` | Stellar seed strings |
| `phone`, `phoneNumber`, `*.phone`, `*.phoneNumber` | WhatsApp user phone numbers |

Wallet addresses are partially masked by a custom serialiser: the first 4 and
last 4 characters are retained, the middle is replaced with `…`.
Example: `GCXT…K7YA`.

---

## Datadog Setup

Set the `DD_API_KEY` environment variable to enable automatic log shipping via
`pino-datadog-transport`. When `DD_API_KEY` is absent the logger falls back to
stdout JSON (suitable for Railway log drains or manual Datadog agent collection).

```bash
DD_API_KEY=your_datadog_api_key
DD_SITE=us1          # or eu1, us3, us5, ap1 — defaults to us1
SERVICE_NAME=neurowealth-agent
NODE_ENV=production
```

If `pino-datadog-transport` is not installed, logs are written to stdout in JSON
format. Install it as an optional dependency when needed:

```bash
npm install pino-datadog-transport
```

### Datadog log pipeline

Configure a Datadog log pipeline to:

1. Parse the `time` field as the official log timestamp
2. Remap `level` → `status`
3. Add facets on `service`, `requestId`, `userId`

---

## Grafana Loki Alternative

To ship logs to Grafana Loki instead of Datadog:

1. Run the Promtail agent alongside the NeuroWealth agent
2. Configure Promtail to tail the agent's stdout (or a log file)
3. Add a Loki datasource in Grafana pointed at your Loki instance

No code changes are needed — the stdout JSON format is directly supported by
Promtail's `json` pipeline stage.

---

## Request ID Tracing

Every HTTP request gets a UUID v4 `requestId` generated in `requestContextMiddleware`
(`agent/src/requestContext.ts`). The ID is:

- Stored in `AsyncLocalStorage` for the lifetime of the request
- Echoed back in the `X-Request-ID` response header
- Automatically included in every log call made within that request context

If the gateway forwards an `X-Request-ID` header the existing value is reused,
enabling end-to-end correlation from frontend → agent → database.

### Usage in route handlers

```typescript
import { createRequestLogger } from './logger';

// In your route handler:
const reqLogger = createRequestLogger(requestId, userId);
reqLogger.info({ action: 'deposit', amount }, 'Processing deposit');
reqLogger.error({ err }, 'Deposit failed');
```

---

## Log-Based Alerting

### ERROR spike alert (PagerDuty)

Configure a Datadog monitor to trigger a PagerDuty incident when the ERROR log
rate exceeds 10 per minute:

1. Go to **Datadog → Monitors → New Monitor → Log**
2. Query: `service:neurowealth-agent status:error`
3. Evaluation window: **1 minute**
4. Threshold: **> 10**
5. Notification: send to your PagerDuty integration

### Recommended additional monitors

| Alert | Query | Threshold |
|-------|-------|-----------|
| RPC circuit open | `service:neurowealth-agent "RPC circuit opened"` | > 0 in 5 min |
| Rebalance failures | `service:neurowealth-agent "Rebalance failed"` | > 3 in 10 min |
| No heartbeat | `service:neurowealth-agent "Heartbeat written"` missing for | 5 min |

---

## Log Hygiene CI Check

The workflow `.github/workflows/log-aggregation-check.yml` fails the build if
any non-test TypeScript file in `agent/src/` contains a bare `console.log` call.
All logging must go through the structured pino logger.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` (prod), `debug` (dev) | Minimum log level |
| `SERVICE_NAME` | `neurowealth-agent` | Service name tag in all log lines |
| `NODE_ENV` | — | `production` enables JSON-only transport |
| `DD_API_KEY` | — | Datadog API key; enables pino-datadog-transport |
| `DD_SITE` | `us1` | Datadog site region |
