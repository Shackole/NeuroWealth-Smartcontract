# Railway Deployment Guide (#114)

This document covers the continuous deployment configuration for the
NeuroWealth AI Agent backend on [Railway](https://railway.app).

---

## Architecture

| Environment | Branch | Deploy trigger | Approval required |
|-------------|--------|----------------|-------------------|
| Staging | `staging` | Auto on push | No |
| Production | `main` | Auto on push | **Yes** — GitHub environment protection |

Both environments are configured via `agent/railway.toml` and deployed
using the `agent/Dockerfile`.

---

## Required secrets

Configure these in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | API token from Railway dashboard (Account Settings → Tokens) |
| `RAILWAY_SERVICE_ID_STAGING` | Service ID of the staging agent service (Railway dashboard → Settings → Service ID) |
| `RAILWAY_SERVICE_ID_PRODUCTION` | Service ID of the production agent service |
| `RAILWAY_PROJECT_URL_STAGING` | Public URL of the staging service (e.g. `https://neurowealth-agent-staging.up.railway.app`) |
| `RAILWAY_PROJECT_URL_PRODUCTION` | Public URL of the production service |
| `DEPLOY_SLACK_WEBHOOK_URL` | Slack incoming webhook URL for deploy notifications |

---

## Environment variables (Railway dashboard)

Set these in **Railway → Service → Variables** (never commit these):

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | HTTP port the agent listens on | `3001` |
| `NODE_ENV` | Node environment | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `SOROBAN_RPC_URL` | Stellar Soroban RPC endpoint | `https://soroban-mainnet.stellar.org` |
| `VAULT_ADDRESS` | Deployed vault contract address | `C...` |
| `OPENAI_API_KEYS` | Comma-separated OpenAI API keys | `sk-...` |
| `RATE_LIMIT_WINDOW_MS` | Rate limiter window (ms) | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Global rate limit per window | `30` |
| `USER_RATE_LIMIT_MAX_REQUESTS` | Per-user rate limit per window | `20` |
| `MAX_DB_POOL_SIZE` | PostgreSQL pool max connections | `10` |
| `MIN_DB_POOL_SIZE` | PostgreSQL pool min connections | `2` |
| `LOG_LEVEL` | Pino log level | `info` |

---

## Zero-downtime deploys

Railway uses a **rolling restart** strategy:

1. Railway builds a new container from the Dockerfile.
2. The new container starts and begins receiving traffic only after
   `healthcheckPath` (`/health/ready`) returns HTTP 200.
3. The old container is drained and stopped.

No traffic is dropped during this switchover. The `healthcheckTimeout` is
set to 10 seconds; if the new container does not become healthy within the
configured retries, Railway automatically rolls back to the previous build.

---

## Rollback procedure

To roll back to a previous deployment:

1. Open the [Railway dashboard](https://railway.app).
2. Select your project → select the **agent production** service.
3. Click the **Deployments** tab.
4. Find the last known-good deployment (identified by commit SHA and timestamp).
5. Click the **⋯** menu → **Redeploy**.
6. Monitor the health check at `https://<production-url>/health/ready` until
   it returns HTTP 200.
7. Notify the team via Slack once the rollback is confirmed healthy.

> **Note:** Rolling back does not run reverse database migrations.
> If the deployment included a schema change, perform a manual migration
> rollback before redeploying the old application version.

---

## Manual deploy (local / emergency)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Authenticate
railway login

# Deploy to staging
RAILWAY_TOKEN=$YOUR_TOKEN railway up \
  --service $RAILWAY_SERVICE_ID_STAGING

# Deploy to production (requires manual token with production access)
RAILWAY_TOKEN=$YOUR_TOKEN railway up \
  --service $RAILWAY_SERVICE_ID_PRODUCTION
```

---

## Health check

The `/health/ready` endpoint (implemented in `agent/src/health.ts`) returns:

- **HTTP 200** — DB pool and Stellar RPC connection are healthy.
- **HTTP 503** — one or more dependencies are unhealthy.

Railway uses this path with a 10-second timeout to gate deploys and monitor
running services. If the endpoint returns non-200 for too long, Railway will
automatically restart the service.

---

## Staging vs production environment

| Aspect | Staging | Production |
|--------|---------|------------|
| Branch | `staging` | `main` |
| Manual approval | No | Yes (GitHub environment protection) |
| Railway service | Separate Railway service | Separate Railway service |
| Secrets | Staging-specific values | Production values |
| Database | Staging Supabase project | Production Supabase project |
| Stellar network | Testnet | Mainnet |
