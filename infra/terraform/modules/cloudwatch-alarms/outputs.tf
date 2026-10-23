output "sns_topic_arn" {
  description = "ARN of the SNS topic for CloudWatch alarm notifications."
  value       = aws_sns_topic.alerts.arn
}

output "alarm_arns" {
  description = "List of CloudWatch alarm ARNs managed by this module."
  value       = [aws_cloudwatch_metric_alarm.backup_missing.arn]
}

output "log_group_name" {
  description = "Name of the CloudWatch log group for agent logs."
  value       = aws_cloudwatch_log_group.agent.name
}
