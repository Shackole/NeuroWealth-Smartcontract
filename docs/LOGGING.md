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

## API Error Responses

API errors include a stable `code` and the request's `requestId` in the response
body. The same request ID is returned in the `X-Request-ID` header and included
in structured server logs. Database exceptions are logged server-side as `err`
objects with the method, path, error code, and request ID; exception messages,
SQL, and connection details are never returned to API callers.

| Failure | HTTP status | Code | Public error |
|---------|-------------|------|--------------|
| Invalid request input | `400` | `INVALID_INPUT` | A safe validation message |
| Authenticated user not found | `404` | `USER_NOT_FOUND` | `User not found` |
| Database operation or connection failed | `503` | `DATABASE_UNAVAILABLE` | `Service temporarily unavailable` |

### Verification

From `agent/`, run `npm run build`. To check response behavior without a
database or production credentials, build the agent and run a local Express
test harness that replaces `pool.query` with a rejected promise containing a
distinctive database error, then send:

1. `POST /api/auth/login` with a non-empty `stellarAddress`: expect HTTP `503`,
   `DATABASE_UNAVAILABLE`, a `requestId` matching the `X-Request-ID` header,
   and no part of the injected database error in the response. Confirm the
   structured server log contains that same request ID and the error details.
2. `POST /api/auth/login` with an empty body: expect HTTP `400`, `INVALID_INPUT`,
   and a `requestId` matching the `X-Request-ID` header.
3. `POST /api/transactions` with valid test fields and a mocked rejected
   `pool.connect`: expect the same safe `503` response, including when the
   connection fails before a transaction client is acquired.

The database-failure case should use a test-only mock and test data; it does not
need a live database, network, contract deployment, or production credentials.

Verification record for this change: the isolated HTTP harness passed all three
scenarios. The injected database error appeared in a structured log entry with
the same request ID returned by the 503 response, and was absent from that
response. Validation returned 400 with a distinct code and matching request ID.
The transaction connection-failure case also returned the safe 503 response
with a matching request ID.
The agent's normal `npm run build` is currently blocked by the existing
TypeScript configuration referencing an uninstalled `jest` type package; a
focused strict TypeScript check of `api.ts` passed using a temporary declaration
for the existing undeclared `jsonwebtoken` dependency.

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
