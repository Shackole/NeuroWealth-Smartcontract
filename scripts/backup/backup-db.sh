#!/usr/bin/env bash
# scripts/backup/backup-db.sh
#
# Automated PostgreSQL backup for NeuroWealth Supabase database (Issue #117).
#
# What this script does:
#   1. Dumps the database with pg_dump -Fc -Z9 (compressed custom format)
#   2. Encrypts the dump file with AES-256-CBC using openssl
#   3. Uploads the encrypted backup to S3
#   4. Writes a JSON health beacon to S3 so check-backup-health.sh can verify
#      that a backup was completed within the last 25 hours
#
# Required environment variables:
#   DATABASE_URL              Full Postgres connection string
#   BACKUP_S3_BUCKET          S3 bucket name (no s3:// prefix)
#   BACKUP_ENCRYPTION_KEY     AES-256 passphrase for openssl enc
#   AWS_ACCESS_KEY_ID         AWS credentials (or use IAM role)
#   AWS_SECRET_ACCESS_KEY     AWS credentials
#   AWS_DEFAULT_REGION        AWS region (default: us-east-1)
#
# Optional:
#   BACKUP_S3_PREFIX          Key prefix inside bucket (default: backups/)
#   PGDUMP_EXTRA_OPTS         Extra flags passed to pg_dump

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
TIMESTAMP="$(date -u +'%Y-%m-%d_%H-%M-%S')"
BACKUP_FILENAME="neurowealth_backup_${TIMESTAMP}.dump"
ENCRYPTED_FILENAME="${BACKUP_FILENAME}.enc"
TMPDIR="$(mktemp -d)"
BACKUP_PATH="${TMPDIR}/${BACKUP_FILENAME}"
ENCRYPTED_PATH="${TMPDIR}/${ENCRYPTED_FILENAME}"
S3_PREFIX="${BACKUP_S3_PREFIX:-backups/}"
AWS_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

log() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"; }
error() { echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ERROR: $*" >&2; }

cleanup() {
  log "Cleaning up temporary files"
  rm -rf "${TMPDIR}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Validate required env vars
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

# ---------------------------------------------------------------------------
# Step 1: pg_dump
# ---------------------------------------------------------------------------
log "Starting pg_dump → ${BACKUP_PATH}"
pg_dump \
  --no-password \
  --format=custom \
  --compress=9 \
  ${PGDUMP_EXTRA_OPTS:-} \
  "${DATABASE_URL}" \
  --file="${BACKUP_PATH}"
log "pg_dump complete. Size: $(du -sh "${BACKUP_PATH}" | cut -f1)"

# ---------------------------------------------------------------------------
# Step 2: Encrypt with AES-256-CBC
# ---------------------------------------------------------------------------
log "Encrypting backup → ${ENCRYPTED_PATH}"
openssl enc -aes-256-cbc \
  -salt \
  -pbkdf2 \
  -iter 100000 \
  -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in "${BACKUP_PATH}" \
  -out "${ENCRYPTED_PATH}"
log "Encryption complete. Encrypted size: $(du -sh "${ENCRYPTED_PATH}" | cut -f1)"

# Remove plaintext dump immediately after encryption
rm -f "${BACKUP_PATH}"

# ---------------------------------------------------------------------------
# Step 3: Upload to S3
# ---------------------------------------------------------------------------
S3_KEY="${S3_PREFIX}${ENCRYPTED_FILENAME}"
S3_URI="s3://${BACKUP_S3_BUCKET}/${S3_KEY}"

log "Uploading to ${S3_URI}"
aws s3 cp \
  --region "${AWS_REGION}" \
  --storage-class STANDARD_IA \
  "${ENCRYPTED_PATH}" \
  "${S3_URI}"
log "Upload complete"

# ---------------------------------------------------------------------------
# Step 4: Write health beacon
# ---------------------------------------------------------------------------
HEALTH_JSON="${TMPDIR}/backup-health.json"
cat > "${HEALTH_JSON}" <<EOF
{
  "last_backup_at": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "backup_file": "${S3_KEY}",
  "status": "ok"
}
EOF

aws s3 cp \
  --region "${AWS_REGION}" \
  --content-type "application/json" \
  "${HEALTH_JSON}" \
  "s3://${BACKUP_S3_BUCKET}/${S3_PREFIX}backup-health.json"

log "Backup completed successfully: ${S3_KEY}"
