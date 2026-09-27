variable "alarm_name_prefix" {
  description = "Prefix applied to all CloudWatch alarm names (e.g. neurowealth-production)."
  type        = string
}

variable "backup_bucket_name" {
  description = "Name of the S3 backup bucket to monitor."
  type        = string
}

variable "alert_email" {
  description = "Email address for SNS alarm notifications. Leave empty to skip subscription."
  type        = string
  default     = ""
}

variable "log_group_name" {
  description = "CloudWatch log group name for agent application logs."
  type        = string
  default     = "/neurowealth/agent"
}
