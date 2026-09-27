variable "key_alias" {
  description = "KMS key alias (without the 'alias/' prefix)."
  type        = string
}

variable "description" {
  description = "Human-readable description of what this key protects."
  type        = string
}

variable "deletion_window_in_days" {
  description = "Days before a scheduled key deletion takes effect (7–30)."
  type        = number
  default     = 30

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "deletion_window_in_days must be between 7 and 30."
  }
}
