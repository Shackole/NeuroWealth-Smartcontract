# Agent Health and Readiness

| Endpoint | Meaning | Dependency behavior |
|----------|---------|---------------------|
| `GET /health/live` | The Node process is alive. | Always returns `200` while the HTTP server can answer; it does not query dependencies, so an outage does not trigger an orchestrator restart loop. |
| `GET /health/ready` | The instance can accept work. | Returns `503` if any configured database, Redis, or Stellar RPC check fails. |
| `GET /health` | Operator summary and metrics. | Returns `503` for degraded configured dependencies or a fully degraded configured AI-key pool; payload contains safe status/latency and aggregate metrics, not connection strings, API keys, or provider error text. |

In `NODE_ENV=production`, database and Stellar RPC are required by default. A
missing required service is not considered ready. In local development, a
service may remain unconfigured. `HEALTH_REQUIRED_DEPENDENCIES` can override
the required set with comma-separated names (`database`, `stellar_rpc`, or
`redis`). Redis affects readiness when the process has been configured with a
Redis health adapter; the current main entrypoint does not expose queue
credentials or Redis error details in the response.

Dependency failures change readiness to `503` and leave liveness at `200`.
Point orchestrator traffic checks to `/health/ready` and restart checks to
`/health/live`. See [`HTTP_DEPLOYMENT.md`](HTTP_DEPLOYMENT.md) for the reverse
proxy path and timeout budgets.
