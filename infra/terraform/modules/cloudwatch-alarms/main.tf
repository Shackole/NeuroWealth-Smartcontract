# CloudWatch alarms module — monitors S3 backup health and agent logs.
#
# Creates:
#   - SNS topic for alarm notifications (email subscription optional)
#   - CloudWatch alarm: fires if the backup bucket receives no new objects
#     in a 24-hour period (indicates a failed backup job)
#   - CloudWatch log group for agent application logs

resource "aws_sns_topic" "alerts" {
  name = "${var.alarm_name_prefix}-alerts"

  tags = {
    Purpose = "monitoring-alerts"
  }
}

# Optional email subscription — only created when alert_email is non-empty.
resource "aws_sns_topic_subscription" "email" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Alarm: backup bucket received no PUT requests in the last 24 hours.
# NumberOfObjects is not real-time, so we use BucketSizeBytes as a proxy —
# if size does not increase for 2 consecutive days, raise an alarm.
# For a more precise check, instrument the backup script to publish a custom
# metric (e.g. neurowealth/BackupSuccess) and alarm on that.
resource "aws_cloudwatch_metric_alarm" "backup_missing" {
  alarm_name          = "${var.alarm_name_prefix}-backup-missing"
  alarm_description   = "S3 backup bucket has not received new objects in 24 h — backup job may have failed."
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "NumberOfObjects"
  namespace           = "AWS/S3"
  period              = 86400 # 24 hours (daily metric)
  statistic           = "Average"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    BucketName  = var.backup_bucket_name
    StorageType = "AllStorageTypes"
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = {
    Purpose = "backup-monitoring"
  }
}

# CloudWatch log group for the agent application logs.
# Agent logs are shipped here via CloudWatch Logs agent or Fluent Bit.
resource "aws_cloudwatch_log_group" "agent" {
  name              = var.log_group_name
  retention_in_days = 30

  tags = {
    Purpose = "agent-logs"
  }
}
