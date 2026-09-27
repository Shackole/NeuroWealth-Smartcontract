# Terraform version and provider requirements for NeuroWealth infrastructure.
# Requires Terraform >= 1.5 for the `check` block and other modern features.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    railway = {
      source  = "railwayapp/railway"
      version = "~> 0.4"
    }
  }
}
