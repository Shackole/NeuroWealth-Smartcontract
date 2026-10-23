# Root-level outputs aggregated from all modules.

output "railway_project_id" {
  description = "Railway project ID."
  value       = module.railway.project_id
}

output "railway_staging_service_id" {
  description = "Railway staging agent service ID."
  value       = module.railway.staging_service_id
}

output "railway_production_service_id" {
  description = "Railway production agent service ID."
  value       = module.railway.production_service_id
}

output "backup_bucket_id" {
  description = "Name of the S3 bucket used for database backups."
  value       = module.s3_backup.bucket_id
}

output "backup_bucket_arn" {
  description = "ARN of the S3 backup bucket."
  value       = module.s3_backup.bucket_arn
}

output "kms_key_id" {
  description = "KMS key ID for custodial keypair encryption."
  value       = module.kms.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN for custodial keypair encryption."
  value       = module.kms.key_arn
}

output "cloudwatch_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications."
  value       = module.cloudwatch_alarms.sns_topic_arn
}

output "dynamodb_lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking."
  value       = module.dynamodb_lock.table_name
}
