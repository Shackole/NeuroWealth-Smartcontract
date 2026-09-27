# DynamoDB lock module — table used for Terraform remote state locking.
#
# This prevents concurrent `terraform apply` runs from corrupting state.
# Created once during bootstrap; referenced in backend.tf.

resource "aws_dynamodb_table" "tf_lock" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Purpose = "terraform-state-lock"
  }
}
