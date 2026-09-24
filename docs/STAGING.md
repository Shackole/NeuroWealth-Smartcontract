# Staging Environment

NeuroWealth staging is a persistent integration environment that mirrors the
production service layout while using Stellar **testnet** and a separate
Supabase project. It is deployed from the `staging` branch.

## Components

| Component | Staging deployment | Production isolation |
|---|---|---|
| Frontend | Vercel project with domain `staging.neurowealth.app` (or the configured staging URL) | Separate Vercel project and environment variables |
| Agent | Railway service in the `staging` environment, built from `agent/Dockerfile` | Separate Railway service and project/environment |
| Vault | Soroban contract on Stellar testnet | Different contract on Stellar mainnet |
| Database | Dedicated Supabase staging project | Never share a project, URL, or service key |

## One-time setup

1. Create a Supabase project named `neurowealth-staging`. Apply the migrations
   in `supabase/migrations/` using the Supabase CLI or SQL editor. The project
   must not be the production project. The weekly reset uses
   `supabase/seed.sql`.
2. Create a Railway project and service for the agent. Set the service root or
   deployment path to `agent`, use `agent/railway.json`, and attach a Railway
   environment named `staging`.
3. Create a Vercel project with root directory `frontend`, attach the staging
   domain, and use `frontend/vercel.json`.
4. Create a GitHub Environment named `staging`. Add these secrets:

   | Secret | Purpose |
   |---|---|
   | `STAGING_DEPLOYER_SECRET_KEY` | Optional funded testnet deployer; leave empty to use a new Friendbot-funded identity |
   | `VERCEL_TOKEN` | Vercel deployment token |
   | `VERCEL_ORG_ID` | Vercel team/account ID |
   | `VERCEL_STAGING_PROJECT_ID` | Staging Vercel project ID |
   | `RAILWAY_TOKEN` | Railway staging deployment token |
   | `STAGING_DATABASE_URL` | Connection URL for the staging Supabase database only |

   Add these GitHub Environment variables:

   | Variable | Example |
   |---|---|
   | `RAILWAY_STAGING_SERVICE` | `neurowealth-agent-staging` |
   | `STAGING_BASE_URL` | `https://staging.neurowealth.app` |

5. Configure the Railway service variables from `.env.staging.template`:
   `APP_ENV=staging`, `SOROBAN_RPC_URL`,
   `SOROBAN_NETWORK_PASSPHRASE`, `DATABASE_URL`, `PORT=3001`, and the
   staging-only agent configuration. Do not add mainnet URLs, production
   Supabase URLs, or production secret keys.
6. Protect the `main` branch with the `staging-e2e` check, or make the
   production deployment workflow call this workflow and require it to pass.

## Automatic deployment

Pushes to `staging` run `.github/workflows/staging.yml`:

1. Build the contract and deploy/initialize a testnet vault. The script uses
   `stellar keys generate --fund` when no deployer secret is supplied, which
   funds the staging identity through Stellar testnet Friendbot.
2. Upload the generated contract/token/agent addresses as a short-lived CI
   artifact.
3. Build and deploy the frontend to Vercel with the generated testnet vault
   contract ID.
4. Deploy the agent Docker service to Railway staging.
5. Run `frontend/e2e/staging.spec.ts` against `STAGING_BASE_URL`.

The deployment intentionally creates a fresh testnet vault for each staging
deployment. The latest contract ID is visible in the workflow artifact and is
passed to the frontend build; no contract address is committed to Git.

Run locally with the Stellar CLI installed:

```bash
cp .env.staging.template .env.staging
set -a
source .env.staging
set +a
./scripts/deploy-staging.sh
```

## Database reset

`.github/workflows/staging-db-reset.yml` runs every Sunday at 04:00 UTC and
can be started manually. It verifies `APP_ENV=staging`, rejects URLs that look
like production, truncates staging tables, and applies `supabase/seed.sql`.
The reset is destructive to staging data and never runs against production.

To run it locally:

```bash
APP_ENV=staging STAGING_DATABASE_URL='postgresql://...staging...' \
  ./scripts/reset-staging-db.sh
```

## Environment reference

Use [.env.staging.template](../.env.staging.template) as the complete
non-secret template. Public frontend values are:

- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_VAULT_CONTRACT_ID`
- `NEXT_PUBLIC_WS_URL` when websocket updates are enabled

Backend values include `DATABASE_URL`, `SOROBAN_RPC_URL`,
`SOROBAN_NETWORK_PASSPHRASE`, and agent service configuration. Secret values
belong in Vercel, Railway, Supabase, or GitHub Environment secret stores, not
in `.env.staging` commits or workflow logs.

## Verification and production gate

The browser smoke test checks the deployed locale route, page title, dashboard
heading, and wallet entry point. Run it locally with:

```bash
cd frontend
npm ci
npx playwright install chromium
STAGING_BASE_URL=https://staging.neurowealth.app npm run test:e2e
```

Production deployment must wait for the staging workflow and its Playwright
job to pass. Contract-level testnet coverage remains available through
`scripts/e2e-devnet.sh`; it is complementary to the browser smoke test.