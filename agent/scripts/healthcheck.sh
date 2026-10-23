#!/usr/bin/env bash
# healthcheck.sh — polls the agent /health/ready endpoint every 30 seconds
# and triggers a restart if the service is unhealthy (#120).
#
# Usage:
#   Standalone daemon: nohup bash agent/scripts/healthcheck.sh &
#   systemd timer:     see agent/PROCESS_MANAGEMENT.md for a .timer unit example.
#
# Environment variables:
#   HEALTH_URL        URL to poll (default: http://localhost:3001/health/ready)
#   CHECK_INTERVAL    Seconds between checks (default: 30)
#   LOG_FILE          Path to append log lines (default: /var/log/neurowealth-agent/healthcheck.log)
#   PROCESS_MANAGER   'systemd' or 'pm2' — which restart mechanism to use (default: systemd)
#   MAX_FAILURES      Consecutive failures before triggering restart (default: 3)

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:3001/health/ready}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
LOG_FILE="${LOG_FILE:-/var/log/neurowealth-agent/healthcheck.log}"
PROCESS_MANAGER="${PROCESS_MANAGER:-systemd}"
MAX_FAILURES="${MAX_FAILURES:-3}"

# Ensure log directory exists.
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local level="$1"
  shift
  echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') [$level] $*" | tee -a "$LOG_FILE"
}

restart_agent() {
  log "WARN" "Triggering agent restart via ${PROCESS_MANAGER}"
  case "$PROCESS_MANAGER" in
    pm2)
      pm2 restart neurowealth-agent 2>>"$LOG_FILE" || \
        log "ERROR" "pm2 restart failed"
      ;;
    systemd)
      systemctl restart neurowealth-agent 2>>"$LOG_FILE" || \
        log "ERROR" "systemctl restart failed (are you running as root?)"
      ;;
    *)
      log "ERROR" "Unknown PROCESS_MANAGER='${PROCESS_MANAGER}'. Set to 'pm2' or 'systemd'."
      ;;
  esac
}

failures=0

log "INFO" "Health-check daemon starting — polling ${HEALTH_URL} every ${CHECK_INTERVAL}s"

while true; do
  http_code=$(curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    --connect-timeout 5 \
    --max-time 10 \
    "$HEALTH_URL" 2>>"$LOG_FILE" || echo "000")

  if [ "$http_code" = "200" ]; then
    if [ "$failures" -gt 0 ]; then
      log "INFO" "Agent recovered (HTTP ${http_code}). Resetting failure counter."
    fi
    failures=0
  else
    failures=$((failures + 1))
    log "WARN" "Health check failed (HTTP ${http_code}). Consecutive failures: ${failures}/${MAX_FAILURES}"

    if [ "$failures" -ge "$MAX_FAILURES" ]; then
      log "ERROR" "Failure threshold reached (${failures}). Restarting agent."
      restart_agent
      failures=0
      # Give the agent time to start before the next check.
      sleep "$((CHECK_INTERVAL * 2))"
      continue
    fi
  fi

  sleep "$CHECK_INTERVAL"
done
