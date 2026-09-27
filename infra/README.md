# infra/ — Monitoring Stack

Prometheus + Grafana monitoring for the NeuroWealth agent and vault.

## Directory Layout

```
infra/
├── prometheus.yml                        # Prometheus scrape configuration
├── alertmanager.yml                      # Alertmanager notification routing
├── docker-compose.monitoring.yml         # Docker Compose stack
├── rules/
│   └── neurowealth_alerts.yml            # Prometheus alert rules
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus.yml            # Auto-provision Prometheus datasource
│       └── dashboards/
│           └── neurowealth.yml           # Dashboard file discovery config
└── metrics/
    ├── metrics.js                        # prom-client instrumentation module
    ├── package.json                      # Pinned dependencies
    └── README.md                         # Integration guide
```

Dashboard JSON files live in `docs/grafana/` and are mounted read-only into
the Grafana container:

```
docs/grafana/
├── backend-service-health.json   # HTTP rate, latency, queue depth, RPC latency
└── vault-operations.json         # TVL, share price, deposit/withdrawal, rebalance history
```

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.devnet.template .env.monitoring   # or create a fresh .env.monitoring
# Set at minimum:
#   AGENT_HOST=<your-agent-hostname>
#   GRAFANA_ADMIN_PASSWORD=<strong-password>

# 2. Start the stack
docker-compose -f infra/docker-compose.monitoring.yml up -d

# 3. Open Grafana
open http://localhost:3030
# Login: admin / <GRAFANA_ADMIN_PASSWORD>

# 4. Open Prometheus
open http://localhost:9090
```

## Prometheus Scrape Target

The agent must expose `GET /metrics` in Prometheus text format.
See `infra/metrics/README.md` for the Node.js integration guide.

Default scrape target: `http://${AGENT_HOST}:${AGENT_PORT}/metrics`  
Default port: `3000`

## Dashboards

| Dashboard | UID | Description |
| --- | --- | --- |
| Backend Service Health | `neurowealth-backend` | HTTP rate/latency, error rate, queue depth, Stellar RPC latency, rebalance count |
| Vault Operations | `neurowealth-vault` | TVL, share price, deposit/withdrawal counts, rebalance history, slow-bleed detection |

Both dashboards are provisioned automatically on Grafana startup. To add a
new dashboard, place its JSON file in `docs/grafana/` and restart or wait
for the 30-second hot-reload cycle.

## Alert Rules

Alerts are defined in `infra/rules/neurowealth_alerts.yml`. Key alerts:

| Alert | Severity | Threshold |
| --- | --- | --- |
| `AgentDown` | critical | Decision loop stale > 5 min |
| `AgentHighErrorRate` | warning | HTTP errors > 5% |
| `QueueDepthHigh` | warning | Queue depth > 100 |
| `QueueDepthCritical` | critical | Queue depth > 500 |
| `VaultPaused` | warning | Vault paused > 5 min |
| `VaultPausedTooLong` | critical | Vault paused > 24 h |
| `UnexplainedTvlDropCritical` | critical | TVL drop > 5% without WithdrawEvent |
| `UnexplainedTvlDropHigh` | warning | TVL drop > 1% without WithdrawEvent |
| `AssetsUpdatedHourlyDecreaseCluster` | warning | > 150 bps decrease per hour |
| `AssetsUpdatedSustainedBleedDrain` | critical | > 300 bps decrease per 24 h |
| `ShareSupplyUnaccountedDrift` | critical | TotalShares changed without deposit/withdraw |
| `StellarRpcHighLatency` | warning | p99 RPC latency > 10 s |
| `VaultCircuitBreakerApproachingThreshold` | warning | Consecutive failures ≥ 2 |

Full threshold rationale is in [`docs/monitoring.md`](../docs/monitoring.md).

## Notification Routing

Edit `infra/alertmanager.yml` to configure Slack, PagerDuty, or webhook
endpoints. The file ships with commented-out examples for both. Secrets
should be passed via environment variables — never commit real webhook URLs
or API keys.
