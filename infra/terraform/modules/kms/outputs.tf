output "key_id" {
  description = "KMS key ID."
  value       = aws_kms_key.custodial.key_id
}

output "key_arn" {
  description = "KMS key ARN."
  value       = aws_kms_key.custodial.arn
}

output "key_alias_arn" {
  description = "KMS key alias ARN."
  value       = aws_kms_alias.custodial.arn
}
