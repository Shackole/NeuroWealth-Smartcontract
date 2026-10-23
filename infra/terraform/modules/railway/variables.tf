variable "project_name" {
  description = "Railway project name."
  type        = string
}

variable "railway_token" {
  description = "Railway API token."
  type        = string
  sensitive   = true
}

variable "repo_url" {
  description = "GitHub repository URL for Railway to deploy from."
  type        = string
}
