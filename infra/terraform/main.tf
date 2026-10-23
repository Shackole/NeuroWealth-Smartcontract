# Root Terraform configuration — wires together all modules.
#
# Modules:
#   railway           — Railway project + staging/production agent services
#   s3-backup         — S3 bucket for PostgreSQL database backups
#   kms               — KMS key for encrypting custodial Stellar keypairs
#   cloudwatch-alarms — CloudWatch alarms + SNS topic for backup monitoring
#   dynamodb-lock     — DynamoDB table for Terraform remote state locking

# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "railway" {
  token = var.railway_token
}

# ---------------------------------------------------------------------------
# Modules
# ---------------------------------------------------------------------------

module "railway" {
  source = "./modules/railway"

  project_name  = var.project_name
  railway_token = var.railway_token
  repo_url      = var.railway_repo_url
}

module "s3_backup" {
  source = "./modules/s3-backup"

  bucket_name           = "${var.backup_bucket_name}-${var.environment}"
  environment           = var.environment
  backup_retention_days = var.backup_retention_days
}

module "kms" {
  source = "./modules/kms"

  key_alias                 = var.kms_key_alias
  description               = "NeuroWealth custodial Stellar keypair encryption key"
  deletion_window_in_days   = var.kms_deletion_window_in_days
}

module "cloudwatch_alarms" {
  source = "./modules/cloudwatch-alarms"

  alarm_name_prefix  = "${var.project_name}-${var.environment}"
  backup_bucket_name = module.s3_backup.bucket_id
  alert_email        = var.alert_email
  log_group_name     = "/neurowealth/${var.environment}/agent"
}

module "dynamodb_lock" {
  source = "./modules/dynamodb-lock"

  table_name = var.tf_lock_table
}
