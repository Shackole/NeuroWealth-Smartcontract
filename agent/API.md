# Agent HTTP API and authentication reference

## What the configured production command serves

`agent/package.json` maps `npm run start:prod` to `npx ts-node src/index.ts`.
That entrypoint mounts JSON parsing, IP and user rate limiters, `healthRouter`,
and `strategyRouter`. Its HTTP routes are:

| Method and path | Auth | Behavior |
| --- | --- | --- |
| `GET /health` | None | Dependency and agent health summary |
| `GET /health/ready` | None | Readiness; non-ready dependencies produce 503 |
| `GET /health/live` | None | Process liveness |
| `GET /api/agent/strategy-distribution` | None | Latest strategy distribution; 204 before first calculation |

The strategy distribution includes the latest stored APY observation for each
protocol source. `apyBps` is in basis points and `provenance.observedAt` is the
original observation time in UTC ISO 8601 format. Snapshot source identifiers
are the stored protocol names. `apyObservations` is empty when snapshots are
unavailable. Older snapshots use their original database recording time.

Example HTTP 200 response fixture:

```json
{
  "distribution": {
    "total": 1,
    "conservative": 0,
    "balanced": 1,
    "growth": 0,
    "conservativePct": 0,
    "balancedPct": 100,
    "growthPct": 0,
    "aggregateBlendBps": 6000,
    "aggregateDexBps": 4000,
    "computedAt": "2026-09-26T05:00:00.000Z"
  },
  "recommendedAllocation": { "blendBps": 6000, "dexBps": 4000 },
  "apyObservations": [
    {
      "protocol": "blend",
      "apyBps": 850,
      "provenance": {
        "source": "blend",
        "observedAt": "2026-09-26T04:58:00.000Z"
      }
    }
  ]
}
```

The production entrypoint also starts the event listener, an hourly decision
loop, and the issuer-freeze monitor. It stops those loops and closes the
database pool on `SIGTERM` or `SIGINT`.

The routes below are present in the source but **are not mounted by the
configured production entrypoint**. They are documented to make the parallel
API generations and their exact contracts visible; do not assume that a route
responds in a deployed `start:prod` process.

## Alternate `app.ts` + `api.ts` route generation

`agent/src/app.ts` mounts the `apiRouter` exported by `agent/src/api.ts` at
`/api`. If a deployment explicitly starts this alternate Express app, it
provides:

| Method and path | Auth | Main success response |
| --- | --- | --- |
| `POST /api/auth/login` | None in code | `{ token, user }`; body `{ "stellarAddress": "G..." }` |
| `GET /api/auth/verify` | `Authorization: Bearer <token>` | `{ valid: true, user }` |
| `GET /api/balance` | Bearer token | Numeric `balance`, `shares`, `exchangeRate`, `strategy` |
| `GET /api/earnings` | Bearer token | Numeric `today`, `week`, `month`, and history |
| `GET /api/transactions` | Bearer token | Last 50 transaction records |
| `POST /api/transactions` | Bearer token | Creates a record; body `{ type, amount, shares, txHash }` |
| `GET /api/apy` | Public | Current APY estimates |
| `GET /api/stats` | Public | Vault statistics |

The legacy `/api/auth/login` implementation accepts a Stellar address without
verifying a wallet signature and issues a one-hour token. Do not treat that
route as proof of wallet ownership. Monetary fields in this router include
JavaScript numbers and are not exact financial execution inputs; see
[`../docs/MONETARY_UNITS.md`](../docs/MONETARY_UNITS.md).

Example source-level request (only available when the alternate app is mounted):

```sh
curl -i -X POST "$AGENT_BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data '{"stellarAddress":"G_REPLACE_WITH_PUBLIC_TEST_ADDRESS"}'
```

Protected requests use the returned token as `Authorization: Bearer <token>`.
Never put a live token, private seed, or secret in a command history, URL, or
documentation example.

## Other unmounted API generations

`agent/src/apiRouter.ts` is a separate router with an in-memory per-IP limit of
100 requests per minute. It declares:

| Method and path | Auth | Response notes |
| --- | --- | --- |
| `GET /api/balance/:address` | `requireAuth` bearer access token | USDC as a seven-decimal string |
| `GET /api/earnings/:address?range=7d` | `requireAuth` | Decimal-string earnings; range clamped to 1–365 days |
| `GET /api/transactions/:address?page=1&limit=10` | `requireAuth` | Decimal-string amounts; limit clamped to 1–100 |
| `GET /api/apy` | Public | APY data |
| `GET /api/stats` | Public | Vault statistics |

Authenticated address routes reject a token/address mismatch with 403. Missing,
malformed, or expired bearer tokens return 401. Invalid input returns 400,
missing on-chain accounts can return 404, the per-IP limiter returns 429, and
unavailable Horizon/database dependencies return 503.

The router's paths already include `/api`. Mounting it at `/api` would produce
`/api/api/...`; it is currently not mounted in either `index.ts` or `app.ts`.

`agent/src/authRouter.ts` declares a separate Stellar Sign-In With Stellar
(SIWS) flow: `GET /api/auth/challenge?address=G...`, `POST /api/auth/verify`,
and `POST /api/auth/refresh`. It returns a 15-minute access token and a
seven-day rotating refresh token, backed by Redis. That router is also not
mounted by the production entrypoint or `app.ts`.

## Earnings history date ranges

Both earnings routes accept paired `startDate` and `endDate` query parameters
in UTC calendar date format (`YYYY-MM-DD`). The dates are inclusive. A
same-day range is valid and the maximum range contains 365 calendar days.
The addressed route accepts either the paired dates or its existing `range`
parameter. The alternate app applies the dates to `history` and keeps its
existing `today`, `week`, and `month` summaries.

Example request path:

```text
/api/earnings?startDate=2025-01-01&endDate=2025-12-31
```

Missing partners, invalid calendar dates, reversed dates, and ranges over
365 inclusive days return HTTP 400. The alternate app includes
`code: "INVALID_HISTORY_DATE_RANGE"` and the usual request ID when available.
The addressed route returns an `error` string and appends
`"; omit range when using dates"`.

```json
{
  "error": "startDate and endDate must be YYYY-MM-DD UTC dates in order, spanning at most 365 inclusive days"
}
```

## Error handling and safe examples

Treat status codes as part of the response contract:

- `400`: malformed or missing request fields/address.
- `401`: missing, invalid, or expired bearer token; SIWS challenge/nonce failure.
- `403`: authenticated wallet does not match the requested Stellar address.
- `404`: an on-chain account or database user does not exist.
- `429`: configured rate limit exceeded.
- `503`: RPC, database, or challenge service unavailable.
- `500`: unexpected persistence or server failure in the legacy router.

Successful response properties and failure shapes are defined by the route
handlers in `api.ts`, `apiRouter.ts`, `auth.ts`, and `authRouter.ts`. Do not
assume the similar endpoint names have identical payloads or authentication:
the configured production process presently mounts none of those data/auth
routers.

## Transaction and Queue Status Reason Codes

Integrators interacting with transaction queues (`/api/queue/stats`), asynchronous submission workers, and automated rebalance decisions receive machine-readable reason and status codes. The tables below specify the exact meaning of each returned status and reason, whether the condition is terminal or non-terminal, and the required polling interval or backoff strategy.

### 1. Transaction Queue and Submission Status Codes

These statuses reflect the lifecycle of transactions enqueued in the Redis/Bull submission pipeline (`transactions` and dead-letter `transactions:failed` queues) and tracked across service recovery.

| Status / Reason Code | Terminality | Meaning & Internal Pipeline State | When to Poll Again / Integrator Action |
| --- | --- | --- | --- |
| `waiting` / `queued` | **Non-Terminal** | Job is accepted and waiting in the Redis queue for an available worker thread (concurrency limit: 5 workers). | Poll after **2–3 seconds**. |
| `active` / `in_flight` | **Non-Terminal** | Worker is currently fetching sequence numbers, building/signing the Soroban envelope, or waiting on Horizon RPC broadcast. | Poll after **2–3 seconds**. |
| `completed` / `confirmed` / `SUCCESS` | **Terminal** (Success) | Transaction was successfully submitted and confirmed on-chain in a closed Stellar ledger. Returns `{ txHash, ledger, submittedAt }`. | **Stop polling**. Transaction state is final and immutable. |
| `deduplicated` / `skipped_duplicate` | **Terminal** (Ignored) | An identical transaction with the same `deduplicationKey` was submitted within the 60-second TTL window (`DEDUP_TTL_MS = 60000`), or previously confirmed on-chain/DB during recovery. | **Stop polling** for duplicate job. Wait **60 seconds** before re-submitting with the same key if unintended. |
| `tx_bad_seq` / `sequence_mismatch` | **Non-Terminal** | Sequence number mismatch occurred against the Stellar Horizon node. The agent worker automatically re-fetches the account sequence number and re-signs with jitter (up to 3 internal attempts). | Poll after **2–4 seconds**. The worker resolves sequence conflicts automatically without requiring client re-submission. |
| `delayed` / `failed` (transient attempt < 3) | **Non-Terminal** | Submission failed due to a transient RPC timeout or network interruption. The job enters Bull's exponential backoff queue (2 s → 4 s → 8 s). | Poll after **4–8 seconds** (aligning with the exponential backoff window). |
| `dead_letter` / `retries_exhausted` | **Terminal** (Permanent Failure) | The transaction exhausted all retry attempts (3 attempts) and was moved to the dead-letter queue (`transactions:failed`) with `failedReason` attached. | **Stop polling**. Operational or manual intervention is required to inspect the DLQ record. |
| `blocked` | **Terminal** (Validation Failure) | The job failed pre-execution invariants during recovery (e.g., mismatched `networkPassphrase`, mismatched vault `contractId`, or unverified on-chain finality). | **Stop polling**. Check payload parameters and contract deployment settings. |

### 2. Strategy and Rebalance Decision Reason Codes

Automated rebalance checks (`GET /api/agent/strategy-distribution` and internal evaluation loops) return explicit `skipReason` explanations when no rebalancing transaction is dispatched.

| Reason Code | Terminality | Meaning | When to Poll Again / Integrator Action |
| --- | --- | --- | --- |
| `already_on_best_protocol` | **Terminal for cycle** | The current vault allocation is already deployed to the protocol offering the highest risk-adjusted yield. | Poll at the next scheduled rebalance interval (typically **60 minutes**). |
| `improvement_below_threshold` | **Terminal for cycle** | A candidate protocol offers higher yield, but the delta does not meet the minimum improvement threshold (e.g. 50 bps). Rebalancing gas cost exceeds expected gain. | Poll at the next scheduled hourly cycle (**60 minutes**). |
| `cooldown_active` | **Non-Terminal** | Vault contract is in a post-rebalance lock period (`remaining` ledgers pending). Prevents rebalance oscillations. | Poll after the cooldown expires. Each Stellar ledger closes in ~5 seconds (e.g. `remaining * 5` seconds). |
| `current_protocol_apy_unavailable` | **Terminal for cycle** | Upstream adapter failed to fetch APY for the active protocol. Rebalance skipped for safety. | Poll in **5–15 minutes** or next hourly decision loop. |
| `no_apy_data_available` | **Terminal for cycle** | Price oracle or protocol adapters returned no usable APY metrics across all candidate protocols. | Poll in **5–15 minutes** after oracle refresh. |
| `no_usable_ranked_protocol_data` | **Terminal for cycle** | Candidate protocols failed whitelist validation or risk score ceiling checks. | Poll at next evaluation cycle (**60 minutes**). |
| `invalid_rebalance_bounds` | **Terminal for cycle** | Target rebalance amount violates liquidity caps, idle balance reserves, or maximum slippage parameters. | Poll after vault deposits/withdrawals alter pool liquidity. |
| `submission_outcome_uncertain` | **Non-Terminal** | Rebalance transaction timed out during broadcast. Agent reconciliation job is verifying on-chain event status. | Poll after **15–30 seconds** for reconciliation result. |
| `rebalance_submission_failed` | **Terminal for attempt** | On-chain contract invocation failed or reverted. Increments the consecutive failure tracker. | **Stop polling**. If consecutive failures exceed threshold, inspect `/health` for degraded health status. |

### 3. HTTP API Error Reasons and Polling Guidance

When interacting with synchronous REST endpoints (`apiRouter.ts`, `api.ts`, `authRouter.ts`), callers should observe standard HTTP error semantics:

| HTTP Code | Error Code / Reason | Terminality | Integrator Action & Polling Strategy |
| --- | --- | --- | --- |
| `400` | `INVALID_INPUT` | **Terminal** | Request payload is malformed, missing required fields, or address is not a valid Stellar `G...` key. Fix request body before retrying; do not poll without code changes. |
| `401` | `UNAUTHORIZED` | **Terminal** | Bearer token is missing, expired, or SIWS challenge signature failed. Re-authenticate immediately via login/SIWS flow before retrying. |
| `403` | `FORBIDDEN` | **Terminal** | Authenticated wallet does not match the requested route address, or user lacks the required `operator` scope. Do not poll. |
| `404` | `NOT_FOUND` | **Terminal** | Stellar account or database entity does not exist. Do not poll until the account is funded on-chain. |
| `429` | `RATE_LIMITED` | **Non-Terminal** | In-memory IP rate limit (100 req/min) or user limit exceeded. Wait until the 60-second window resets (or respect `Retry-After` header) before polling. |
| `503` | `SERVICE_UNAVAILABLE` | **Non-Terminal** | Upstream database pool, Horizon node, or Redis queue is temporarily unreachable. Implement exponential backoff: retry after **2s**, **4s**, **8s**, up to **30s**. |


## Source review evidence

- `agent/package.json` selects `src/index.ts` for `start:prod`.
- `agent/src/index.ts` mounts health and strategy distribution routers only.
- `agent/src/app.ts` mounts `api.ts`, not `apiRouter.ts` or `authRouter.ts`.
- `agent/src/api.ts` uses `authenticateToken` and a one-hour JWT; its login
  handler does not verify an address signature.
- `agent/src/apiRouter.ts` uses `requireAuth`, address binding, and decimal
  strings for the newer query routes.
- `agent/src/authRouter.ts` implements SIWS and refresh rotation but has no
  import or mount in either app entrypoint.
