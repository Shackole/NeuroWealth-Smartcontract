#!/usr/bin/env bash
# scripts/backup/restore-db.sh
#
# Restore a NeuroWealth PostgreSQL backup from S3 (Issue #117).
#
# Usage:
#   ./restore-db.sh <backup-filename>   Restore the named encrypted backup
#   ./restore-db.sh --list              List available backups in S3
#   ./restore-db.sh --dry-run <file>    Validate the backup without restoring
#
# Required environment variables:
#   DATABASE_URL              Target Postgres connection string
#   BACKUP_S3_BUCKET          S3 bucket name
#   BACKUP_ENCRYPTION_KEY     AES-256 passphrase used during backup
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or IAM role)
#
# Optional:
#   BACKUP_S3_PREFIX          Key prefix inside bucket (default: backups/)
#   AWS_DEFAULT_REGION        AWS region (default: us-east-1)

set -euo pipefail

S3_PREFIX="${BACKUP_S3_PREFIX:-backups/}"
AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
TMPDIR="$(mktemp -d)"
DRY_RUN=false

log()   { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }
error() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

cleanup() {
  log "Cleaning up temporary files"
  rm -rf "${TMPDIR}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
if [[ $# -eq 0 ]]; then
  error "Usage: $0 [--list | --dry-run <file> | <backup-filename>]"
  exit 1
fi

case "$1" in
  --list)
    : "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
    log "Available backups in s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}"
    aws s3 ls "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}" \
      --region "${AWS_REGION}" | grep '\.enc$' | sort
    exit 0
    ;;
  --dry-run)
    DRY_RUN=true
    shift
    ;;
esac

BACKUP_FILENAME="$1"

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

ENCRYPTED_PATH="${TMPDIR}/${BACKUP_FILENAME}"
DECRYPTED_PATH="${TMPDIR}/${BACKUP_FILENAME%.enc}"

# ---------------------------------------------------------------------------
# Step 1: Download from S3
# ---------------------------------------------------------------------------
S3_URI="s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}${BACKUP_FILENAME}"
log "Downloading ${S3_URI}"
aws s3 cp \
  --region "${AWS_REGION}" \
  "${S3_URI}" \
  "${ENCRYPTED_PATH}"
log "Download complete. Size: $(du -sh "${ENCRYPTED_PATH}" | cut -f1)"

# ---------------------------------------------------------------------------
# Step 2: Decrypt
# ---------------------------------------------------------------------------
log "Decrypting backup"
openssl enc -d -aes-256-cbc \
  -pbkdf2 \
  -iter 100000 \
  -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in "${ENCRYPTED_PATH}" \
  -out "${DECRYPTED_PATH}"
log "Decryption complete. Decrypted size: $(du -sh "${DECRYPTED_PATH}" | cut -f1)"

# Remove encrypted file now that we have the plaintext
rm -f "${ENCRYPTED_PATH}"

# ---------------------------------------------------------------------------
# Step 3: Validate (always) / Restore (non-dry-run only)
# ---------------------------------------------------------------------------
log "Validating backup integrity with pg_restore --list"
pg_restore --list "${DECRYPTED_PATH}" > /dev/null
log "Backup file is valid"

if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY RUN: backup validated successfully. No data was restored."
  exit 0
fi

log "Starting restore to ${DATABASE_URL}"
log "WARNING: This will overwrite the target database. You have 5 seconds to cancel (Ctrl-C)."
sleep 5

pg_restore \
  --no-password \
  --clean \
  --if-exists \
  --exit-on-error \
  --format=custom \
  --dbname="${DATABASE_URL}" \
  "${DECRYPTED_PATH}"

log "Restore completed successfully from ${BACKUP_FILENAME}"
log "Estimated RTO: < 2 hours for a full production restore (including download and decryption)"
