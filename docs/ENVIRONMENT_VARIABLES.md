# Environment Variable Reference

Names and defaults below are taken from the current service code, Compose
files, and checked-in templates. A value described as a placeholder must be
replaced before the feature is used. Do not commit populated `.env` files or
paste secrets into issue reports.

## Agent (`agent/`)

| Variable | Required / default | Secret? | Purpose |
|----------|--------------------|---------|---------|
| `PORT` | Optional; `3001` | No | Agent HTTP API port. |
| `METRICS_PORT` | Optional; `9100` | No | Metrics and health server port. |
| `NODE_ENV` | Optional; local template uses `development` | No | Runtime mode and logging behavior. |
| `DATABASE_URL` | Required for database-backed routes; unset disables some persistence | **Yes** | PostgreSQL connection string. Keep in the deployment secret store. |
| `REDIS_URL` | Optional; `redis://localhost:6379` | **Yes in shared deployments** | Redis connection used by queues/caches; can include a password. |
| `VAULT_CONTRACT_ID` | Required for contract event/yield jobs; unset disables or limits them | No | Soroban vault contract identifier. |
| `SOROBAN_RPC_URL` | Optional; Soroban testnet URL | No | Soroban RPC endpoint. |
| `SOROBAN_RPC_URL_FALLBACK` | Optional; Horizon testnet fallback | No | Secondary RPC endpoint where used. |
| `SOROBAN_NETWORK_PASSPHRASE` | Optional; testnet passphrase | No | Network identity for Soroban transaction operations. Must match the RPC network. |
| `STELLAR_RPC_URL` | Optional; Horizon testnet URL | No | Horizon endpoint used by older Stellar API and transaction paths. |
| `STELLAR_NETWORK` | Optional; testnet unless set to `mainnet` | No | Selects network behavior in transaction queue code. |
| `AGENT_SECRET_KEY` | Optional for read-only work; required for signing actions | **Yes, critical** | Stellar signing key used by transaction queue workflows. Prefer a restricted testnet key locally. |
| `OWNER_SECRET_KEY` | Optional; only used by issuer-freeze actions | **Yes, critical** | Owner-authorized emergency action key. Do not use a production owner key in local development. |
| `JWT_SECRET` | Required in production; code contains development fallback strings | **Yes, critical** | Signs API authentication tokens. Set a unique random value in every deployed environment. |
| `ENCRYPTION_KEY` / `KEYPAIR_ENCRYPTION_KEY` | Required for custodial key encryption; code has development fallback strings | **Yes, critical** | Encrypts server-managed wallet secrets. Configure a stable, high-entropy value or KMS-backed encryption before accepting accounts. |
| `KMS_KEY_ID`, `AWS_REGION` | Optional; region defaults to `us-east-1` | Identifier / environment-specific | Selects AWS KMS key and region when KMS encryption is enabled. AWS credentials must be supplied by workload identity or a secret store, never committed. |
| `OPENAI_API_KEYS` / `OPENAI_API_KEY` | Optional; no credential by default | **Yes** | OpenAI intent/model integration. `OPENAI_API_KEYS` supports key rotation. |
| `ANTHROPIC_API_KEY` | Optional; no credential by default | **Yes** | Anthropic intent/model integration. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Optional unless sending OTPs | **Yes** | Twilio account, authentication token, and sending number for OTP delivery. |
| `SENDGRID_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` | Optional | **Yes for API key** | Email alert delivery. |
| `SLACK_ALERT_WEBHOOK`, `SLACK_WEBHOOK_URL`, `PAGERDUTY_ROUTING_KEY` | Optional | **Yes** | Alert destinations; configure only the provider actually in use. |
| `MAX_DB_POOL_SIZE`, `MIN_DB_POOL_SIZE`, `DB_IDLE_TIMEOUT_MS`, `DB_CONN_TIMEOUT_MS` | Optional; pool defaults are 10 max / 2 min | No | PostgreSQL pool sizing and timeout controls. |
| `BLEND_POOL_ADDRESS`, `BLEND_USDC_ASSET`, `DEX_USDC_POOL_ID` | Optional | No | Protocol identifiers for APY and pool integrations. |
| `YIELD_CHECK_INTERVAL_MS`, `YIELD_CHECK_SLIPPAGE_BPS`, `YIELD_CHECK_MIN_IMPROVEMENT` | Optional; defined in `agent/src/yieldCheckJob.ts` | No | Yield check cadence and transaction thresholds. Slippage is basis points. |
| `RATE_LIMIT_*`, `WHATSAPP_RATE_LIMIT_MAX` | Optional; defaults in `agent/src/rateLimiter.ts` | No | API rate-limit windows and request limits. |

For exact, less commonly used tuning knobs, search the service source for
`process.env`. Defaults can differ between older modules; set a value
explicitly when two paths must share the same network or policy.

## Frontend (`frontend/`)

| Variable | Required / default | Secret? | Purpose |
|----------|--------------------|---------|---------|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Optional; Soroban testnet URL | No; embedded in browser bundle | Public RPC endpoint. |
| `NEXT_PUBLIC_SOROBAN_NETWORK_PASSPHRASE` | Optional; Stellar testnet passphrase | No; embedded in browser bundle | Network identity; must match the RPC and contract. |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Optional; `testnet` | No; embedded in browser bundle | Wallet network selection. |
| `NEXT_PUBLIC_VAULT_CONTRACT_ID` | Optional; repository testnet fallback | No; embedded in browser bundle | Vault contract to display/use. |
| `NEXT_PUBLIC_USDC_TOKEN_CONTRACT_ID` | Optional | No; embedded in browser bundle | Token contract used by vault helper paths. |
| `NEXT_PUBLIC_WS_URL` | Optional; `ws://localhost:3001` | No; embedded in browser bundle | WebSocket endpoint for live portfolio data. |
| `AGENT_METRICS_URL` | Optional | No | Server-side agent metrics endpoint used by API routes. |
| `SERVICE_PUBLIC_KEY` | Optional | No | Public key used by the asset-breakdown route when configured. |
| `ANALYZE` | Optional; disabled | No | Enables Next bundle analyzer when set to `true`. |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Required by deployment workflow | **Token is secret** | Vercel deployment credentials and project identifiers; configure in GitHub Actions secrets. |

Never put a private key, database URL, API token, or signing credential in a
`NEXT_PUBLIC_*` variable; Next.js exposes those values to every browser user.

## WhatsApp (`whatsapp/`)

| Variable | Required / default | Secret? | Purpose |
|----------|--------------------|---------|---------|
| `PORT` | Optional; `3000` | No | Webhook server port. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Required to validate and send Twilio messages | **Yes** | Twilio webhook signature validation and API access. |
| `TWILIO_WHATSAPP_FROM` | Optional; Twilio sandbox number | No | WhatsApp sender identifier. |
| `WEBHOOK_BASE_URL` | Optional | No | Public HTTPS base URL used to construct callback paths. |
| `DATABASE_URL` | Optional in current code | **Yes** | PostgreSQL connection for database-backed lookup paths. |
| `REDIS_URL` | Optional; `redis://localhost:6379` | **Yes in shared deployments** | Bull queue connection. |
| `ENCRYPTION_KEY` | Must be configured outside local demos; code has an unsafe fallback | **Yes, critical** | Encrypts custodial wallet secret keys. |
| `PHONE_HASH_SALT` | Must be configured consistently in deployed environments; code has a development fallback | **Yes** | Salt for hashing phone numbers before using them as identifiers. |

The current WhatsApp wallet service stores encrypted wallet records in process
memory, not in PostgreSQL. Restarting the process loses those records. Treat
the integration as a prototype and do not use it for real funds until durable
storage, key lifecycle, recovery, and custody controls are implemented and
reviewed.

## Database, Redis, and monitoring

| Variable | Service | Required / default | Secret? | Purpose |
|----------|---------|--------------------|---------|---------|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Agent Compose | `postgres`, `postgres`, `neurowealth` for local only | Password is secret outside local use | Initializes local PostgreSQL. Change credentials for shared environments. |
| `DATABASE_URL` | Agent / WhatsApp | PostgreSQL URL | **Yes** | Connects to the selected database. Hostname differs inside Docker (`postgres`) vs host-run processes (`localhost`). |
| `REDIS_URL` | Agent / WhatsApp | Local Redis URL | **Yes in shared deployments** | Queue/cache connection; use `redis` as the Docker Compose hostname from containers. |
| `AGENT_HOST`, `AGENT_PORT` | Monitoring | `host.docker.internal`, `3000` | No | Target scraped by Prometheus. Set to the address reachable from the monitoring network. |
| `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` | Monitoring | `admin`, `changeme` | Password is secret | Grafana administrator login. Replace the default before starting any shared or exposed instance. |
| `GRAFANA_ROOT_URL` | Monitoring | `http://localhost:3030` | No | URL used by Grafana to construct links. |

Deployment-only database, Redis, AWS, Railway, Twilio, and alert credentials
belong in the provider's secret manager or workload identity configuration,
not in this repository. For the local run sequence and ports, see
[`LOCAL_DEVELOPMENT.md`](LOCAL_DEVELOPMENT.md).
