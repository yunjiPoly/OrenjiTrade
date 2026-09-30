output "notification_channel_id" {
  description = "Email notification channel id (null when alert_email is unset)."
  value       = var.alert_email == null ? null : google_monitoring_notification_channel.email[0].id
}

output "uptime_check_ids" {
  description = "Map of uptime check short ids."
  value = {
    api_readiness = google_monitoring_uptime_check_config.api_readiness.uptime_check_id
    web_root      = google_monitoring_uptime_check_config.web_root.uptime_check_id
  }
}

output "alert_policy_names" {
  description = "Names of every alert policy created."
  value = concat(
    [for p in google_monitoring_alert_policy.uptime : p.name],
    [google_monitoring_alert_policy.api_5xx_ratio.name, google_monitoring_alert_policy.api_p95_latency.name, google_monitoring_alert_policy.sql_cpu.name, google_monitoring_alert_policy.sql_connections.name, google_monitoring_alert_policy.pubsub_oldest_unacked.name],
    [for p in google_monitoring_alert_policy.business_failures : p.name],
  )
}

output "log_based_metric_names" {
  description = "Names of the log-based metrics."
  value       = [for m in google_logging_metric.business_failures : m.name]
}
