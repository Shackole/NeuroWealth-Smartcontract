# Staging restore drill

The scheduled workflow restores a **sanitized testnet backup** into its own
ephemeral PostgreSQL 16 service. `scripts/backup/restore-staging.sh` rejects
every database URL except `localhost`/`127.0.0.1` database `restore_db`; it
does not read `DATABASE_URL` or the production backup bucket.

Configure these GitHub Actions secrets before enabling the scheduled drill:

- `STAGING_AWS_ACCESS_KEY_ID` and `STAGING_AWS_SECRET_ACCESS_KEY`: read-only
  access to the dedicated staging backup bucket.
- `STAGING_BACKUP_S3_BUCKET` and `STAGING_BACKUP_S3_KEY`: the encrypted,
  sanitized PostgreSQL custom-format dump under the `staging-sanitized/`
  prefix. Its transaction hashes must belong to Stellar testnet.
- `STAGING_BACKUP_ENCRYPTION_KEY`: the passphrase used by the existing
  `backup-db.sh` AES-256-CBC/PBKDF2 format.
- `AWS_DEFAULT_REGION`: optional; defaults to `us-east-1`.

The restore validates required application tables, rejects unvalidated schema
constraints and invalid transaction rows, records table counts in the workflow
log, then checks up to 100 recent confirmed transactions against Stellar
testnet, including their ledger sequence. Timing and outcome are retained in a
90-day workflow artifact and the GitHub Actions summary. Run it manually from
the Actions tab for an on-demand drill. No production database URL or
production signing credential is used.
