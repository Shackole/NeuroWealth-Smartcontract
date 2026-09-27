# Agent Process Management (#120)

This document describes how to run the NeuroWealth AI Agent as a managed
production process using either **PM2** (recommended for most deployments)
or **systemd** (recommended for bare-metal / VM servers that already use
systemd for service orchestration).

---

## PM2 (recommended)

### Prerequisites

```bash
npm install -g pm2 ts-node typescript
```

### Start / stop

```bash
# Production
npm run start:prod        # pm2 start ecosystem.config.js --env production

# Staging
npm run start:staging     # pm2 start ecosystem.config.js --env staging

# Stop
npm run stop              # pm2 stop neurowealth-agent

# Tail live logs
npm run logs              # pm2 logs neurowealth-agent

# Interactive monitor (CPU, memory, logs)
pm2 monit
```

### Persist across reboots

```bash
pm2 startup               # prints a command — run it as root
pm2 save                  # saves the current process list
```

### Restart policy

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `min_uptime` | 60 s | Process must stay alive ≥ 60 s to count as a successful start |
| `max_restarts` | 5 | Maximum restarts within the rolling window |
| `restart_delay` | 5 000 ms | Wait 5 s between restart attempts |
| Window | 10 min (`600 000 ms`) | Restart counter resets every 10 min |

After 5 fast crashes PM2 marks the process as **errored** and stops retrying.
Inspect with `pm2 show neurowealth-agent` and restart manually with
`pm2 restart neurowealth-agent`.

### Log rotation (PM2)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # daily at midnight
```

---

## systemd

### Installation

```bash
# 1. Create a dedicated system user (no login shell, no home directory write access).
sudo useradd -r -s /sbin/nologin -d /opt/neurowealth neurowealth

# 2. Clone / deploy the agent to /opt/neurowealth/agent.
sudo mkdir -p /opt/neurowealth/agent
sudo chown -R neurowealth:neurowealth /opt/neurowealth

# 3. Create the log directory.
sudo mkdir -p /var/log/neurowealth-agent
sudo chown neurowealth:neurowealth /var/log/neurowealth-agent

# 4. Create the environment file with production secrets (outside version control).
sudo tee /opt/neurowealth/agent/.env.production <<'EOF'
DATABASE_URL=postgres://...
SOROBAN_RPC_URL=https://horizon-mainnet.stellar.org
OPENAI_API_KEYS=sk-...
VAULT_ADDRESS=C...
EOF
sudo chown neurowealth:neurowealth /opt/neurowealth/agent/.env.production
sudo chmod 600 /opt/neurowealth/agent/.env.production

# 5. Install the unit file.
sudo cp agent/neurowealth-agent.service /etc/systemd/system/
sudo systemctl daemon-reload

# 6. Enable + start.
sudo systemctl enable neurowealth-agent
sudo systemctl start neurowealth-agent

# 7. Check status.
sudo systemctl status neurowealth-agent
sudo journalctl -u neurowealth-agent -f
```

### Common commands

```bash
sudo systemctl start   neurowealth-agent
sudo systemctl stop    neurowealth-agent
sudo systemctl restart neurowealth-agent
sudo systemctl status  neurowealth-agent

# Reset the failure counter after investigating a crash loop.
sudo systemctl reset-failed neurowealth-agent

# Follow logs (systemd journal).
sudo journalctl -u neurowealth-agent -f

# Or tail the log file directly.
tail -f /var/log/neurowealth-agent/agent.log
```

### Restart policy

| Directive | Value | Meaning |
|-----------|-------|---------|
| `Restart` | `on-failure` | Restart on non-zero exit code or signal |
| `RestartSec` | `5s` | Wait 5 s between restart attempts |
| `StartLimitIntervalSec` | `600` | 10-minute rolling window |
| `StartLimitBurst` | `5` | Maximum 5 restarts within the window |

---

## Log rotation

Install the provided logrotate configuration:

```bash
sudo cp agent/logrotate.conf /etc/logrotate.d/neurowealth-agent

# Verify (dry run).
sudo logrotate --debug /etc/logrotate.d/neurowealth-agent

# Force immediate rotation (for testing).
sudo logrotate --force /etc/logrotate.d/neurowealth-agent
```

Configuration summary: daily rotation, 14-day retention, gzip compression,
delayed compression (one-cycle delay for log shippers), re-opens log file via
`systemctl reload-or-restart` after rotation.

---

## Health check

The `agent/scripts/healthcheck.sh` script polls `GET /health/ready` every
30 seconds and triggers a restart after 3 consecutive failures.

```bash
# Run as a daemon alongside the agent.
export PROCESS_MANAGER=pm2   # or 'systemd'
export LOG_FILE=/var/log/neurowealth-agent/healthcheck.log
nohup bash agent/scripts/healthcheck.sh &

# Or use npm run healthcheck.
npm run healthcheck
```

Configuration via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_URL` | `http://localhost:3001/health/ready` | Endpoint to poll |
| `CHECK_INTERVAL` | `30` | Seconds between polls |
| `LOG_FILE` | `/var/log/neurowealth-agent/healthcheck.log` | Log output path |
| `PROCESS_MANAGER` | `systemd` | `systemd` or `pm2` |
| `MAX_FAILURES` | `3` | Consecutive failures before restart |

The `/health/ready` endpoint is implemented in `agent/src/health.ts` and
returns HTTP 200 when the DB pool and Stellar RPC connection are healthy.

---

## Graceful shutdown

The agent handles `SIGTERM` (sent by both PM2 and systemd on stop/restart):

1. Stops the hourly decision loop timer.
2. Closes the Stellar event listener WebSocket.
3. Waits for the HTTP server to stop accepting new connections.
4. Closes the PostgreSQL connection pool.
5. Exits with code 0.

PM2 `kill_timeout` and systemd `TimeoutStopSec` are both set to allow
30 seconds for this sequence before a hard `SIGKILL`.
