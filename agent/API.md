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
