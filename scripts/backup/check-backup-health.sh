#!/usr/bin/env bash
# scripts/backup/check-backup-health.sh
#
# Verifies that a database backup was created within the last 25 hours (Issue #117).
# Sends a PagerDuty alert if the backup is stale or missing.
#
# Required environment variables:
#   BACKUP_S3_BUCKET          S3 bucket name
#   PAGERDUTY_ROUTING_KEY     PagerDuty Events API v2 integration key
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or IAM role)
#
# Optional:
#   BACKUP_S3_PREFIX          Key prefix (default: backups/)
#   AWS_DEFAULT_REGION        AWS region (default: us-east-1)
#   MAX_BACKUP_AGE_HOURS      Alert threshold in hours (default: 25)

set -euo pipefail

S3_PREFIX="${BACKUP_S3_PREFIX:-backups/}"
AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
MAX_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-25}"

log()   { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }
error() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${PAGERDUTY_ROUTING_KEY:?PAGERDUTY_ROUTING_KEY is required}"

HEALTH_S3_URI="s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}backup-health.json"
TMPFILE="$(mktemp)"

# ---------------------------------------------------------------------------
# Download health beacon
# ---------------------------------------------------------------------------
log "Fetching health beacon from ${HEALTH_S3_URI}"
if ! aws s3 cp \
  --region "${AWS_REGION}" \
  "${HEALTH_S3_URI}" \
  "${TMPFILE}" 2>/dev/null; then
  error "Health beacon file not found — no backup has ever run."
  trigger_pagerduty_alert "No backup health beacon found in S3 — backup may never have run."
  rm -f "${TMPFILE}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Parse and check timestamp
# ---------------------------------------------------------------------------
LAST_BACKUP_AT="$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d['last_backup_at'])" < "${TMPFILE}" 2>/dev/null || \
  grep -o '"last_backup_at":"[^"]*"' "${TMPFILE}" | cut -d'"' -f4)"

rm -f "${TMPFILE}"

if [[ -z "${LAST_BACKUP_AT}" ]]; then
  error "Could not parse last_backup_at from health beacon."
  trigger_pagerduty_alert "Backup health beacon is malformed — cannot determine last backup time."
  exit 1
fi

log "Last backup at: ${LAST_BACKUP_AT}"

LAST_BACKUP_EPOCH="$(date -u -d "${LAST_BACKUP_AT}" +%s 2>/dev/null || \
  date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "${LAST_BACKUP_AT}" +%s 2>/dev/null || echo 0)"
NOW_EPOCH="$(date -u +%s)"
AGE_HOURS=$(( (NOW_EPOCH - LAST_BACKUP_EPOCH) / 3600 ))

log "Backup age: ${AGE_HOURS} hours (threshold: ${MAX_AGE_HOURS} hours)"

if [[ ${AGE_HOURS} -ge ${MAX_AGE_HOURS} ]]; then
  error "Backup is stale: last backup was ${AGE_HOURS} hours ago (threshold: ${MAX_AGE_HOURS}h)"
  trigger_pagerduty_alert "NeuroWealth database backup is stale: last backup was ${AGE_HOURS}h ago (threshold: ${MAX_AGE_HOURS}h)."
  exit 1
fi

log "Backup health check PASSED. Last backup: ${LAST_BACKUP_AT} (${AGE_HOURS}h ago)"
exit 0

# ---------------------------------------------------------------------------
# PagerDuty alert function
# ---------------------------------------------------------------------------
trigger_pagerduty_alert() {
  local message="$1"
  log "Triggering PagerDuty alert: ${message}"
  curl --silent --show-error --fail \
    --request POST \
    --header "Content-Type: application/json" \
    --data "{
      \"routing_key\": \"${PAGERDUTY_ROUTING_KEY}\",
      \"event_action\": \"trigger\",
      \"payload\": {
        \"summary\": \"[NeuroWealth] Database backup health alert: ${message}\",
        \"severity\": \"critical\",
        \"source\": \"neurowealth-backup-monitor\",
        \"custom_details\": {
          \"bucket\": \"${BACKUP_S3_BUCKET}\",
          \"check_time\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"
        }
      }
    }" \
    "https://events.pagerduty.com/v2/enqueue" || error "Failed to send PagerDuty alert"
}
