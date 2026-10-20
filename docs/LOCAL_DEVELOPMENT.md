# Local Development from a Clean Checkout

This guide starts the repository services that can run locally. It does not
provision production accounts or deploy contracts. Use Stellar testnet/devnet
and disposable credentials for development.

## Prerequisites

- Git
- Node.js 20 or later and npm 10 or later
- Docker Engine and Docker Compose v2 for local PostgreSQL and Redis
- Rust stable with `wasm32-unknown-unknown` and the Stellar CLI version pinned
  in [`.stellar-version`](../.stellar-version) for contract builds

## Install dependencies

From the repository root, install each service from its committed lockfile:

```bash
npm ci
cd agent && npm ci && cd ..
cd frontend && npm ci && cd ..
cd whatsapp && npm ci && cd ..
cd packages/vault-client && npm ci && cd ../..
```

Optional packages such as `packages/monitoring` have their own package
instructions; see that package's README before installing it.

## Start local database and Redis

The agent Compose file provides PostgreSQL 15 and Redis 7, as well as optional
agent and RedisInsight services. Copy the local template first:

```bash
cp agent/.env.local.template agent/.env.local
```

Replace placeholder API keys and secrets with disposable local values. The
template's PostgreSQL and Redis URLs target local Docker ports. Start only the
data services when running Node processes directly:

```bash
docker compose -f agent/docker-compose.yml up -d postgres redis
```

The database schema is mounted into PostgreSQL's initialization directory for
new volumes. If the persistent volume already exists, Docker will not reapply
the initialization script. Do not place production data in this local stack.

## Run the agent and web app

Use separate terminals:

```bash
cd agent
npm run start:dev
```

```bash
cd frontend
npm run dev
```

The agent listens on port `3001` by default. The Next.js app listens on port
`3000`. The agent needs `DATABASE_URL`, `REDIS_URL`, and appropriate testnet
RPC/contract settings for the features that use them. AI and notification
features need their own credentials; they are not required for a frontend
build.

## Optional services

The WhatsApp webhook defaults to port `3000`, which conflicts with the frontend.
Run it on a separate port and configure Twilio's webhook to that local endpoint
(for example, via a private tunnel):

```bash
cd whatsapp
PORT=3002 npm run dev
```

WhatsApp wallet data is currently stored in process memory; restarting the
service loses those records. Do not use real funds or treat this local flow as
durable custody.

Monitoring can be started separately with
`docker compose -f infra/docker-compose.monitoring.yml up -d`; configure its
Grafana admin password and the agent scrape host before exposing it beyond
localhost.

## Build and stop

Build the Rust workspace from the repository root:

```bash
cd neurowealth-vault
stellar contract build
```

Stop local data services while keeping their volumes:

```bash
docker compose -f agent/docker-compose.yml down
```

To remove the disposable PostgreSQL and Redis data too, use
`docker compose -f agent/docker-compose.yml down -v` only when you are certain
the local volume contents can be discarded.

## Ports

| Service | Default port |
|---------|--------------|
| Next.js frontend | 3000 |
| WhatsApp webhook | 3000 (choose another port when frontend is running) |
| Agent API | 3001 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RedisInsight | 8001 |
| Agent metrics | 9100 |

For environment names, defaults, and secret handling, see
[`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md).
