# Deployment Guide — AI Agent Backend

> **Issue:** #78
> **Target platforms:** Railway (primary), Render (alternative)
> **Runtime:** Node.js 20 LTS
> **Services:** PostgreSQL (Supabase), Redis (Railway plugin or Upstash)

This guide covers deploying the NeuroWealth AI agent backend to Railway or Render, including environment variable configuration, database and Redis setup, health checks, custom domains, and rollback procedures.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Railway Deployment (Recommended)](#2-railway-deployment-recommended)
   - [2.1 Install the Railway CLI](#21-install-the-railway-cli)
   - [2.2 Create a Project](#22-create-a-project)
   - [2.3 Connect a GitHub Repository](#23-connect-a-github-repository)
   - [2.4 Add Redis](#24-add-redis)
   - [2.5 Connect to Supabase PostgreSQL](#25-connect-to-supabase-postgresql)
   - [2.6 Configure Environment Variables](#26-configure-environment-variables)
   - [2.7 Configure the Health Check](#27-configure-the-health-check)
   - [2.8 Deploy with `railway up`](#28-deploy-with-railway-up)
   - [2.9 Custom Domain and SSL](#29-custom-domain-and-ssl)
   - [2.10 Rollback a Bad Deploy](#210-rollback-a-bad-deploy)
3. [Render Deployment (Alternative)](#3-render-deployment-alternative)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [Post-Deployment Verification](#5-post-deployment-verification)
6. [Routine Operations](#6-routine-operations)

---

## 1. Prerequisites

Before deploying, ensure you have:

- **Node.js 20+** locally (for building and testing)
- **Railway CLI** installed (see [§2.1](#21-install-the-railway-cli))
- **A Supabase project** with the NeuroWealth database schema applied (see [`db/`](../db/))
- **GitHub repository** pushed to `origin` with the agent code
- **Stellar credentials** — a funded agent keypair on the target network (testnet or mainnet)
- **AI API key** — Claude (Anthropic) or OpenAI key for intent parsing

---

## 2. Railway Deployment (Recommended)

Railway is the recommended platform because it supports monorepo deployments, built-in Redis plugins, automatic TLS, and deployment rollbacks from the dashboard.

### 2.1 Install the Railway CLI

```bash
# macOS / Linux via install script
curl -fsSL https://railway.app/install.sh | sh

# Or via npm
npm install -g @railway/cli

# Log in
railway login
```

Verify the installation:

```bash
railway --version
# railway 3.x.x
```

### 2.2 Create a Project

```bash
# From the agent directory
cd agent/

# Initialize a new Railway project
railway init

# Follow the interactive prompts:
# ? Create a new project or use an existing one? → Create new project
# ? Project name: → neurowealth-agent
```

This creates a `railway.json` (or `railway.toml`) in the current directory and links the local folder to the Railway project.

### 2.3 Connect a GitHub Repository

Connecting GitHub enables automatic deployments on push to `main`.

1. Open the [Railway dashboard](https://railway.app/dashboard).
2. Select your project → **Settings** → **Source** → **Connect Repo**.
3. Authorize Railway to access your GitHub organization.
4. Select `NeuroWealth-Smartcontract` (or the agent sub-repo).
5. Set **Root Directory** to `agent/` if deploying from a monorepo.
6. Set **Branch** to `main`.
7. Enable **Auto-Deploy on Push** (recommended for continuous delivery).

### 2.4 Add Redis

The agent uses [Bull](https://github.com/OptimalBits/bull) for reliable transaction queuing. Bull requires Redis.

**Option A — Railway Redis plugin (simplest):**

```bash
# From within the project directory
railway add

# Select "Redis" from the plugin list
# Railway provisions a managed Redis instance and injects REDIS_URL automatically
```

After adding, confirm the variable is available:

```bash
railway variables | grep REDIS_URL
# REDIS_URL=redis://:password@containers-us-west-xxx.railway.app:6389
```

**Option B — Upstash Redis (serverless, free tier available):**

1. Create a database at [upstash.com](https://upstash.com).
2. Copy the **Redis URL** from the **REST API** tab.
3. Add it as `REDIS_URL` in Railway environment variables (see [§2.6](#26-configure-environment-variables)).

### 2.5 Connect to Supabase PostgreSQL

The agent stores user positions, transaction history, and strategy preferences in PostgreSQL.

**Get the connection string from Supabase:**

1. Open your [Supabase project](https://app.supabase.com).
2. Go to **Project Settings** → **Database** → **Connection string**.
3. Select **URI** format and copy the string.
4. Replace `[YOUR-PASSWORD]` with your database password.

The connection string format is:

```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

> Use the **Session Mode pooler** (port 6543) for a long-lived Node.js agent, not the Transaction Mode pooler (port 5432), to avoid connection limit issues.

**Add the connection string to Railway:**

```bash
railway variables set DATABASE_URL="postgresql://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

Or set it through the Railway dashboard under **Variables**.

### 2.6 Configure Environment Variables

Set all required environment variables before your first deployment. Use the Railway dashboard (**Variables** tab) or the CLI:

```bash
# Set variables one at a time
railway variables set KEY=value

# Or import from a local .env file (never commit this file)
railway variables import .env.production
```

See [§4 Environment Variables Reference](#4-environment-variables-reference) for the full list of required and optional variables.

> **Security:** Never commit `.env` files. Never paste real secret values into source code, scripts, or documentation. See [`docs/SECRETS_HYGIENE.md`](SECRETS_HYGIENE.md) for the full secrets policy.

### 2.7 Configure the Health Check

Railway uses the health check endpoint to determine when a deployment is healthy and to route traffic away from crashed instances.

**In `railway.json` (or `railway.toml`):**

```json
{
  "deploy": {
    "healthcheckPath": "/health/ready",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

Or set it in the Railway dashboard: **Settings** → **Deploy** → **Health Check Path** → `/health/ready`.

**The agent must implement this endpoint.** Minimum implementation in Node.js / Express:

```js
// agent/src/routes/health.js
app.get('/health/ready', async (req, res) => {
  try {
    // Check DB connectivity
    await db.raw('SELECT 1');
    // Check Redis connectivity
    await redisClient.ping();
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// Liveness check (no external dependency checks)
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

Railway polls `GET /health/ready` every 10 seconds by default. A non-2xx response causes Railway to restart the container.

### 2.8 Deploy with `railway up`

**Manual deploy from CLI:**

```bash
cd agent/

# Deploy the current working directory to Railway
railway up

# Stream logs after deployment
railway logs --tail
```

**What happens during `railway up`:**

1. Railway detects the `Dockerfile` (or `nixpacks.toml` / `package.json` for auto-build).
2. Builds the Docker image in Railway's build infrastructure.
3. Pulls environment variables from the project.
4. Spins up the new container.
5. Runs the health check (`GET /health/ready`).
6. Swaps traffic to the new container once health check passes.
7. Tears down the old container.

**Monitor the deployment:**

```bash
# View all deployments
railway deployments

# View logs of the latest deployment
railway logs
```

Or watch live in the Railway dashboard under **Deployments**.

### 2.9 Custom Domain and SSL

Railway provisions a default domain (`xxx.railway.app`) automatically. To add a custom domain:

1. **Dashboard** → **Your Service** → **Settings** → **Domains** → **+ Custom Domain**.
2. Enter your domain (e.g., `api.neurowealth.app`).
3. Railway displays a `CNAME` record to add to your DNS provider:
   ```
   Type:  CNAME
   Name:  api
   Value: xxx.railway.app
   TTL:   3600
   ```
4. Add the DNS record at your registrar (Cloudflare, Route 53, Namecheap, etc.).
5. Railway automatically provisions a Let's Encrypt TLS certificate once DNS propagates (typically 1–5 minutes with Cloudflare, up to 48 hours with other providers).

**Verify SSL:**

```bash
curl -I https://api.neurowealth.app/health/ready
# HTTP/2 200
```

> If using Cloudflare, set the SSL/TLS encryption mode to **Full (strict)** and ensure **Always Use HTTPS** is enabled.

### 2.10 Rollback a Bad Deploy

Railway keeps a full history of deployments with one-click rollback.

**Via the dashboard:**

1. Go to **Deployments** in your service.
2. Find the last known-good deployment.
3. Click **Redeploy** (three-dot menu → **Redeploy**).

Railway will re-run that exact image with the same environment snapshot.

**Via the CLI:**

```bash
# List recent deployments with their IDs
railway deployments

# Redeploy a specific deployment
railway redeploy --deployment <DEPLOYMENT_ID>
```

**Emergency: immediate rollback procedure:**

```bash
# 1. Identify the last good deployment ID
railway deployments --limit 10

# 2. Redeploy it
railway redeploy --deployment <LAST_GOOD_ID>

# 3. Monitor health
railway logs --tail

# 4. Verify health check
curl https://api.neurowealth.app/health/ready
```

> If the bad deployment touched database schema (migrations), you may need to roll back the migration separately before redeploying the old code. Check `db/migrations/` for migration files and use `knex migrate:rollback` or the equivalent.

---

## 3. Render Deployment (Alternative)

[Render](https://render.com) is an alternative to Railway with a similar feature set.

### Setup steps

1. Create a **Web Service** in the Render dashboard.
2. Connect your GitHub repository.
3. Set **Root Directory** to `agent/` (for monorepos).
4. Set **Build Command**: `npm ci && npm run build`
5. Set **Start Command**: `npm start`
6. Set **Health Check Path**: `/health/ready`

### Redis on Render

Create a **Redis** instance in Render (paid tier) or use Upstash. Copy the Redis URL into the `REDIS_URL` environment variable.

### Environment variables on Render

In your Web Service → **Environment** → add each variable from the [reference table](#4-environment-variables-reference). Render encrypts secret environment variables at rest.

### Render auto-deploy

Render automatically deploys on push to the connected branch (configurable). To trigger a manual deploy:

```bash
# Using the Render CLI (optional)
render deploy --service <SERVICE_ID>
```

### Render rollback

In the Render dashboard, navigate to **Deploys** → select a previous deploy → **Rollback to this deploy**.

---

## 4. Environment Variables Reference

Set all of these in Railway (or Render) environment variables — **never commit real values**.

### Required

| Variable | Description | Example (placeholder) |
|----------|-------------|----------------------|
| `DATABASE_URL` | Supabase PostgreSQL connection URI (Session Mode pooler, port 6543) | `postgresql://postgres.ref:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `REDIS_URL` | Redis connection URI for Bull job queues | `redis://:password@containers-us-west-xxx.railway.app:6389` |
| `STELLAR_RPC_URL` | Soroban RPC endpoint | `https://soroban-testnet.stellar.org` (testnet) / `https://mainnet.stellar.validationcloud.io/v1/<key>` (mainnet) |
| `STELLAR_NETWORK` | Network identifier | `testnet` or `mainnet` |
| `AGENT_SECRET_KEY` | Stellar secret seed for the AI agent keypair (starts with `S`) | `SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `VAULT_CONTRACT_ID` | Deployed Soroban vault contract address | `CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `USDC_TOKEN_ADDRESS` | USDC token contract on the target network | `CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `PORT` | HTTP port the agent listens on | `3000` |
| `NODE_ENV` | Node.js environment | `production` |

### AI / Intent Parsing

| Variable | Description | Example (placeholder) |
|----------|-------------|----------------------|
| `CLAUDE_API_KEY` | Anthropic Claude API key for intent parsing | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key (fallback or alternative) | `sk-...` |

Provide at least one AI API key. The agent prefers `CLAUDE_API_KEY` if both are set.

### Supabase

| Variable | Description | Example (placeholder) |
|----------|-------------|----------------------|
| `SUPABASE_URL` | Supabase project URL | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon (public) key | `eyJhbGci...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (grants full DB access — keep secret) | `eyJhbGci...` |

### WhatsApp / Twilio (if using the WhatsApp bot)

| Variable | Description | Example (placeholder) |
|----------|-------------|----------------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | `your_auth_token` |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp-enabled phone number | `+14155238886` |
| `WEBHOOK_SECRET` | Shared secret to validate incoming Twilio webhooks | `a-random-32-char-string` |

### Optional / Tuning

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |
| `REBALANCE_INTERVAL_MS` | How often the decision loop runs (milliseconds) | `3600000` (1 hour) |
| `MAX_QUEUE_CONCURRENCY` | Maximum concurrent Bull job workers | `5` |
| `BLEND_POOL_ADDRESS` | Blend lending pool address (if not set in contract storage) | *(set via `set_blend_pool` on-chain)* |
| `DEX_POOL_ADDRESS` | DEX pool address | *(set via `set_dex_pool` on-chain)* |
| `SENTRY_DSN` | Sentry error tracking DSN | *(optional)* |

---

## 5. Post-Deployment Verification

After each deployment, run these checks before considering it successful:

```bash
# 1. Health check
curl -s https://api.neurowealth.app/health/ready | jq .
# Expected: { "status": "ok", "timestamp": "..." }

# 2. Liveness check
curl -s https://api.neurowealth.app/health/live | jq .
# Expected: { "status": "ok" }

# 3. Verify agent is connected to the vault contract
curl -s https://api.neurowealth.app/api/status | jq .
# Expected: { "vaultContractId": "C...", "network": "mainnet", "agentAddress": "G...", "connected": true }

# 4. Check logs for errors in the first 5 minutes
railway logs --tail 100

# 5. Confirm Redis queue workers are running
railway logs | grep "Bull worker"
```

If any check fails, [roll back immediately](#210-rollback-a-bad-deploy) and investigate.

---

## 6. Routine Operations

### Scale the service

```bash
# Railway: increase replicas via dashboard
# Settings → Deploy → Replicas → set to desired count

# Or via CLI (requires Railway Pro)
railway scale --replicas 2
```

### View and stream logs

```bash
railway logs --tail
railway logs --limit 500
```

### Restart the service

```bash
railway redeploy
```

### Update environment variables without redeploying

In the Railway dashboard, editing a variable triggers an automatic redeploy. To suppress this:

1. Set variables in the dashboard.
2. Toggle **Auto-Deploy** off temporarily if you want to batch variable changes before deploying.

### Monitor costs

Railway bills by resource usage (vCPU + RAM hours). Monitor the **Usage** tab in your project dashboard. For production:

- Agent service: 1 vCPU / 512 MB RAM is sufficient for moderate load.
- Redis: 256 MB is sufficient for Bull queue.
- Set **Spend Limit** in Railway account settings to avoid runaway costs.

### Pre-mainnet checklist

Before deploying the agent to mainnet, confirm:

- [ ] All items in [`docs/MAINNET_CHECKLIST.md`](MAINNET_CHECKLIST.md) are signed off.
- [ ] `AGENT_SECRET_KEY` is a freshly generated keypair, not reused from testnet.
- [ ] `VAULT_CONTRACT_ID` points to the audited mainnet contract.
- [ ] `STELLAR_NETWORK` is set to `mainnet`.
- [ ] Supabase database is a **production** project (not the free tier, which pauses after 1 week of inactivity).
- [ ] Redis persistence is enabled (Railway Redis: turn on **AOF persistence** in plugin settings).
- [ ] Health check is confirmed passing after deploy.
- [ ] Monitoring alerts (see [`docs/monitoring.md`](monitoring.md)) are configured and firing correctly.
