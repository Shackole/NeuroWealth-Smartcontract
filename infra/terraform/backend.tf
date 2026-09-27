# Remote state backend — S3 + DynamoDB lock.
#
# Bootstrap (run once before `terraform init`):
#   aws s3api create-bucket \
#     --bucket <your-tf-state-bucket> \
#     --region us-east-1
#   aws s3api put-bucket-versioning \
#     --bucket <your-tf-state-bucket> \
#     --versioning-configuration Status=Enabled
#   aws dynamodb create-table \
#     --table-name <your-lock-table> \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region us-east-1
#
# Init:
#   terraform init \
#     -backend-config="bucket=<your-tf-state-bucket>" \
#     -backend-config="dynamodb_table=<your-lock-table>" \
#     -backend-config="region=us-east-1"
#
# Or supply these values via TF_STATE_BUCKET / TF_LOCK_TABLE env vars
# in CI (see .github/workflows/terraform.yml).

terraform {
  backend "s3" {
    # These values are supplied at `terraform init` time via -backend-config
    # flags or environment variables.  They are intentionally left empty here
    # so that the same configuration file works for both local and CI runs.
    bucket         = ""            # overridden by -backend-config
    key            = "state/neurowealth/terraform.tfstate"
    region         = ""            # overridden by -backend-config
    dynamodb_table = ""            # overridden by -backend-config
    encrypt        = true
  }
}
