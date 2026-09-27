variable "table_name" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "neurowealth-tf-lock"
}
