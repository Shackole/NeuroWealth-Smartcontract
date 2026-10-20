#!/usr/bin/env bash
# Read-only post-deploy checks. This script never submits transactions or mutates data.
set -euo pipefail

: "${DEPLOYMENT_BASE_URL:?DEPLOYMENT_BASE_URL is required}"
: "${EXPECTED_REVISION:?EXPECTED_REVISION is required}"

if [[ "${DEPLOYMENT_BASE_URL}" != https://* ]]; then
  echo "Smoke check failed for revision ${EXPECTED_REVISION}: deployment URL must use HTTPS" >&2
  exit 1
fi

MAX_RETRIES="${MAX_RETRIES:-10}"
RETRY_DELAY="${RETRY_DELAY:-15}"
HEALTH_URL="${DEPLOYMENT_BASE_URL%/}/health"
READY_URL="${DEPLOYMENT_BASE_URL%/}/health/ready"
LAST_ERROR="no response received"

for ((attempt = 1; attempt <= MAX_RETRIES; attempt++)); do
  READY_BODY="$(curl --silent --show-error --fail --connect-timeout 5 --max-time 10 "$READY_URL" 2>/dev/null || true)"
  HEALTH_BODY="$(curl --silent --show-error --fail --connect-timeout 5 --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"

  if [[ -n "$READY_BODY" && -n "$HEALTH_BODY" ]] && python3 - "$READY_BODY" "$HEALTH_BODY" <<'PY'
import json, sys
try:
    ready, health = (json.loads(value) for value in sys.argv[1:])
    ready_checks = ready.get("checks", {})
    health_checks = health.get("checks", {})
    queue_depth = health.get("rebalance", {}).get("queue_depth")
    valid_queue = isinstance(queue_depth, int) and not isinstance(queue_depth, bool) and queue_depth >= 0
    good = (
        ready.get("ready") is True
        and ready_checks.get("database") == "ok"
        and ready_checks.get("stellar_rpc") == "ok"
        and health.get("status") == "ok"
        and health_checks.get("database") == "ok"
        and health_checks.get("stellar_rpc") == "ok"
        and health_checks.get("redis") in ("ok", "not_configured")
        and valid_queue
    )
    if not good:
        print("readiness/dependency/queue checks did not report healthy", file=sys.stderr)
        raise SystemExit(1)
except (json.JSONDecodeError, AttributeError, TypeError) as error:
    print(f"invalid health response: {error}", file=sys.stderr)
    raise SystemExit(1)
PY
  then
    echo "Deployment smoke checks passed for revision ${EXPECTED_REVISION} (database, Stellar RPC, Redis status, and queue depth)."
    echo "healthy=true" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi

  LAST_ERROR="health endpoints were unavailable or reported an unhealthy dependency"
  echo "Smoke check attempt ${attempt}/${MAX_RETRIES} failed for revision ${EXPECTED_REVISION}."
  if (( attempt < MAX_RETRIES )); then sleep "$RETRY_DELAY"; fi
done

echo "Deployment smoke checks failed for revision ${EXPECTED_REVISION}: ${LAST_ERROR}" >&2
echo "healthy=false" >> "${GITHUB_OUTPUT:-/dev/null}"
exit 1
