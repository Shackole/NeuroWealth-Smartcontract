#!/usr/bin/env bash
# scripts/backup/retention.sh
#
# Enforces backup retention policy for NeuroWealth database backups (Issue #117).
#
# Retention policy:
#   - 7 daily snapshots   (keep one per day for the last 7 days)
#   - 4 weekly snapshots  (keep one per ISO week for the last 4 weeks)
#   - 3 monthly snapshots (keep one per calendar month for the last 3 months)
#
# Any backup outside these windows is deleted from S3.
#
# Required environment variables:
#   BACKUP_S3_BUCKET          S3 bucket name
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or IAM role)
#
# Optional:
#   BACKUP_S3_PREFIX          Key prefix (default: backups/)
#   AWS_DEFAULT_REGION        AWS region (default: us-east-1)
#   DRY_RUN                   Set to 'true' to print deletions without executing

set -euo pipefail

S3_PREFIX="${BACKUP_S3_PREFIX:-backups/}"
AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
DRY_RUN="${DRY_RUN:-false}"

log()   { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"

# ---------------------------------------------------------------------------
# List all backup files with their S3 last-modified dates
# Format from aws s3 ls: "2026-09-27 02:00:01  12345678 neurowealth_backup_2026-09-27_02-00-01.dump.enc"
# ---------------------------------------------------------------------------
log "Listing backups in s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}"
LISTING="$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}" \
  --region "${AWS_REGION}" | grep '\.enc$' | sort || true)"

if [[ -z "${LISTING}" ]]; then
  log "No backups found."
  exit 0
fi

# Build arrays keyed by date (YYYY-MM-DD), ISO week (YYYY-WXX), month (YYYY-MM)
declare -A daily_keep=()   # date → filename
declare -A weekly_keep=()  # YYYY-WXX → filename
declare -A monthly_keep=() # YYYY-MM → filename
declare -a all_files=()

NOW_EPOCH="$(date -u +%s)"
SECONDS_IN_DAY=86400
SECONDS_IN_WEEK=604800

while IFS= read -r line; do
  # Extract filename (last field)
  filename="$(echo "${line}" | awk '{print $NF}')"
  # Extract date from S3 listing (first two fields: "2026-09-27 02:00:01")
  file_date="$(echo "${line}" | awk '{print $1}')"
  all_files+=("${filename}")

  file_epoch="$(date -u -d "${file_date}" +%s 2>/dev/null || date -u -j -f '%Y-%m-%d' "${file_date}" +%s 2>/dev/null || echo 0)"
  age_days=$(( (NOW_EPOCH - file_epoch) / SECONDS_IN_DAY ))
  iso_week="$(date -u -d "${file_date}" +'%G-W%V' 2>/dev/null || date -u -j -f '%Y-%m-%d' "${file_date}" +'%G-W%V' 2>/dev/null || echo '')"
  year_month="${file_date:0:7}"

  # Daily: keep one per day for the last 7 days
  if [[ ${age_days} -le 7 ]]; then
    daily_keep["${file_date}"]="${filename}"
  fi

  # Weekly: keep one per ISO week for the last 4 weeks (~28 days)
  if [[ ${age_days} -le 28 && -n "${iso_week}" ]]; then
    weekly_keep["${iso_week}"]="${filename}"
  fi

  # Monthly: keep one per calendar month for the last 3 months (~92 days)
  if [[ ${age_days} -le 92 ]]; then
    monthly_keep["${year_month}"]="${filename}"
  fi
done <<< "${LISTING}"

# Build set of files to keep
declare -A keep_set=()
for f in "${daily_keep[@]}"; do   keep_set["${f}"]=1; done
for f in "${weekly_keep[@]}"; do  keep_set["${f}"]=1; done
for f in "${monthly_keep[@]}"; do keep_set["${f}"]=1; done

log "Keeping ${#keep_set[@]} backups (daily: ${#daily_keep[@]}, weekly: ${#weekly_keep[@]}, monthly: ${#monthly_keep[@]})"

# Delete everything not in the keep set
deleted=0
for filename in "${all_files[@]}"; do
  if [[ -z "${keep_set[${filename}]+_}" ]]; then
    s3_key="${S3_PREFIX}${filename}"
    if [[ "${DRY_RUN}" == "true" ]]; then
      log "DRY_RUN: would delete s3://${BACKUP_S3_BUCKET}/${s3_key}"
    else
      log "Deleting s3://${BACKUP_S3_BUCKET}/${s3_key}"
      aws s3 rm "s3://${BACKUP_S3_BUCKET}/${s3_key}" --region "${AWS_REGION}"
    fi
    (( deleted++ )) || true
  fi
done

log "Retention complete. Deleted: ${deleted} backup(s)."
