# S3 backup module — secure bucket for PostgreSQL database backups.
#
# Features:
#   - Versioning enabled (protects against accidental deletion/overwrite)
#   - Server-side encryption (AES256)
#   - Public access fully blocked
#   - Lifecycle rules: transition to Glacier after 30 days, expire after N days

resource "aws_s3_bucket" "backup" {
  bucket        = var.bucket_name
  force_destroy = false # Protect against accidental terraform destroy.

  tags = {
    Name    = var.bucket_name
    Purpose = "database-backup"
  }
}

resource "aws_s3_bucket_versioning" "backup" {
  bucket = aws_s3_bucket.backup.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backup" {
  bucket = aws_s3_bucket.backup.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backup" {
  bucket = aws_s3_bucket.backup.id

  rule {
    id     = "backup-lifecycle"
    status = "Enabled"

    # Move to Glacier after 30 days to reduce storage costs.
    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    # Expire (delete) objects after the configured retention period.
    expiration {
      days = var.backup_retention_days
    }

    # Also expire non-current versions to reclaim space.
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}
