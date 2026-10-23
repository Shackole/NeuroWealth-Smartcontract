# Operational retention and capacity limits

Retention balances bounded storage with enough time to investigate incidents.
Destructive deletion schedules are intentionally separate from metrics and
logs that operators need for active incidents.

| Data | Retention / capacity | Configuration |
| --- | --- | --- |
| Agent, PostgreSQL, Redis, RedisInsight container stdout/stderr | 10 MiB per file, 3 files per container (about 30 MiB each) | `agent/docker-compose.yml` JSON-file logging options |
| Prometheus TSDB | 30 days | `infra/docker-compose.monitoring.yml` `--storage.tsdb.retention.time=30d` |
| CloudWatch agent log group | 30 days | `infra/terraform/modules/cloudwatch-alarms/main.tf` |
| Encrypted database backups | Script keeps rolling daily (7), weekly (4), monthly (up to 3 calendar months); S3 lifecycle transitions to Glacier after 30 days and expires at 365 days by default (non-current versions after 90 days) | `scripts/backup/retention.sh`, `infra/terraform/modules/s3-backup/main.tf` |
| Terraform plan artifacts | 7 days | `.github/workflows/terraform.yml` |
| Coverage, E2E, and staging artifacts | 14 days | `.github/workflows/coverage.yml`, `ci.yml`, `staging.yml` |
| Contract spec and secret-scan artifacts | 30 days | `.github/workflows/contract-spec.yml`, `secret-scan.yml` |
| Alertmanager/Grafana local logs | 10 MiB per file, 3 files per container | `infra/docker-compose.monitoring.yml` |

The backup workflow's `retention.sh` only removes encrypted backup objects outside
the rolling daily/weekly/monthly keep set. Review and preserve incident-specific
backup evidence before an operator changes this policy. CI run logs follow the
repository/organization Actions log-retention setting; this workflow-level
policy covers uploaded artifacts rather than changing that external setting.

## Capacity notes

- Each Compose container has its own JSON-file cap; the approximate 30 MiB limit
  is per container, not a global host disk quota.
- Prometheus data is capped by time rather than an explicit byte limit. Monitor
  disk capacity and set `--storage.tsdb.retention.size` for the deployment's
  available volume.
- Grafana state and Prometheus TSDB remain on named volumes. Retention deletes
  old records from those stores; it does not remove the volumes.
- Docker installations using another logging driver must configure the
  equivalent rotation limit in the host/runtime configuration.

## Review evidence

The retention values above match the checked-in Compose options, Terraform
CloudWatch log-group setting, S3 lifecycle variables/script, and workflow
`retention-days` declarations. No running infrastructure was changed.
