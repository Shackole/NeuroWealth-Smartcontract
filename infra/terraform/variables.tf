# Root-level input variables for the NeuroWealth Terraform configuration.

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment tag (e.g. production, staging)."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "dev"], var.environment)
    error_message = "environment must be one of: production, staging, dev."
  }
}

variable "project_name" {
  description = "Human-readable project name used in resource names and tags."
  type        = string
  default     = "neurowealth"
}

variable "railway_token" {
  description = "Railway API token. Set via RAILWAY_TOKEN environment variable or TF_VAR_railway_token."
  type        = string
  sensitive   = true
}

variable "railway_repo_url" {
  description = "GitHub repository URL that Railway will deploy from."
  type        = string
  default     = "https://github.com/julianajohn7202-stack/NeuroWealth-Smartcontract"
}

variable "backup_bucket_name" {
  description = "S3 bucket name for database backups. Must be globally unique."
  type        = string
  default     = "neurowealth-db-backups"
}

variable "backup_retention_days" {
  description = "Number of days to retain S3 backup objects before expiry."
  type        = number
  default     = 365
}

variable "kms_key_alias" {
  description = "KMS key alias for custodial keypair encryption (without the 'alias/' prefix)."
  type        = string
  default     = "neurowealth-custodial-keys"
}

variable "kms_deletion_window_in_days" {
  description = "Number of days before a scheduled KMS key deletion takes effect (7–30)."
  type        = number
  default     = 30

  validation {
    condition     = var.kms_deletion_window_in_days >= 7 && var.kms_deletion_window_in_days <= 30
    error_message = "kms_deletion_window_in_days must be between 7 and 30."
  }
}

variable "alert_email" {
  description = "Email address for CloudWatch alarm SNS notifications."
  type        = string
  default     = ""
}

variable "tf_state_bucket" {
  description = "S3 bucket used for Terraform remote state. Used during bootstrap only."
  type        = string
  default     = ""
}

variable "tf_lock_table" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "neurowealth-tf-lock"
}
