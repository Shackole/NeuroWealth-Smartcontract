variable "bucket_name" {
  description = "Globally unique S3 bucket name for database backups."
  type        = string
}

variable "environment" {
  description = "Deployment environment tag."
  type        = string
}

variable "backup_retention_days" {
  description = "Number of days to retain backup objects before expiry."
  type        = number
  default     = 365
}
