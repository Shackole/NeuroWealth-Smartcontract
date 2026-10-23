# KMS module — customer-managed key for encrypting custodial Stellar keypairs.
#
# Features:
#   - Automatic annual key rotation (enable_key_rotation = true)
#   - Configurable deletion window (7–30 days)
#   - Named alias for easy reference in application code

resource "aws_kms_key" "custodial" {
  description             = var.description
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true # Rotate the key material annually.

  tags = {
    Purpose = "custodial-keypair-encryption"
  }
}

resource "aws_kms_alias" "custodial" {
  name          = "alias/${var.key_alias}"
  target_key_id = aws_kms_key.custodial.key_id
}
