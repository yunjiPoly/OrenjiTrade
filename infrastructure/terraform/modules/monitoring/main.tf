# Observability baseline (ARCHITECTURE.md section 11): uptime checks on the public hostnames,
# alert policies on the golden signals and log-based metrics for business-critical failures.

locals {
  channels = var.alert_email == null ? [] : [google_monitoring_notification_channel.email[0].id]

  api_service_filter = "resource.type = \"cloud_run_revision\" AND resource.label.service_name = \"${var.api_service_name}\""
}

resource "google_monitoring_notification_channel" "email" {
  count = var.alert_email == null ? 0 : 1

  project      = var.project_id
  display_name = "OrenjiTrade on-call email (${var.environment})"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# ---------------------------------------------------------------------------------------
# Uptime checks
# ---------------------------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "api_readiness" {
  project      = var.project_id
  display_name = "api readiness (${var.environment})"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/actuator/health/readiness"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.api_host
    }
  }

  content_matchers {
    content = "UP"
    matcher = "CONTAINS_STRING"
  }
}

resource "google_monitoring_uptime_check_config" "web_root" {
  project      = var.project_id
  display_name = "web root (${var.environment})"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.web_host
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each = {
    api = google_monitoring_uptime_check_config.api_readiness.uptime_check_id
    web = google_monitoring_uptime_check_config.web_root.uptime_check_id
  }

  project               = var.project_id
  display_name          = "[${var.environment}] ${each.key} uptime check failing"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = local.channels

  conditions {
    display_name = "Uptime check failed from more than one region"
    condition_threshold {
      filter          = "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type = \"uptime_url\" AND metric.label.check_id = \"${each.value}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ---------------------------------------------------------------------------------------
# Cloud Run golden signals (api)
# ---------------------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "api_5xx_ratio" {
  project               = var.project_id
  display_name          = "[${var.environment}] api 5xx ratio > ${var.error_ratio_threshold * 100}% (5m)"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = local.channels

  conditions {
    display_name = "5xx responses / all responses"
    condition_threshold {
      filter             = "metric.type = \"run.googleapis.com/request_count\" AND ${local.api_service_filter} AND metric.label.response_code_class = \"5xx\""
      denominator_filter = "metric.type = \"run.googleapis.com/request_count\" AND ${local.api_service_filter}"
      comparison         = "COMPARISON_GT"
      threshold_value    = var.error_ratio_threshold
      duration           = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      denominator_aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = "The api service is returning more than ${var.error_ratio_threshold * 100}% 5xx over 5 minutes. Check Cloud Run logs filtered by severity>=ERROR and the latest revision; roll back with the runbook if the spike started after a deploy."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "api_p95_latency" {
  project               = var.project_id
  display_name          = "[${var.environment}] api p95 latency > ${var.p95_latency_threshold_ms}ms (5m)"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "p95 request latency"
    condition_threshold {
      filter          = "metric.type = \"run.googleapis.com/request_latencies\" AND ${local.api_service_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = var.p95_latency_threshold_ms
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# Resource saturation of the (single) api instance: these are the scale-up signals of the
# low-cost profile (ADR 0016): sustained CPU or memory pressure means it is time to raise the
# limits or move to Memorystore + several instances.
resource "google_monitoring_alert_policy" "api_cpu_utilization" {
  project               = var.project_id
  display_name          = "[${var.environment}] api CPU utilisation > ${var.api_cpu_threshold * 100}% (10m)"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Container CPU utilisation (p99 over 5 minutes)"
    condition_threshold {
      filter          = "metric.type = \"run.googleapis.com/container/cpu/utilizations\" AND ${local.api_service_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = var.api_cpu_threshold
      duration        = "600s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = "The api instance is CPU bound. Scale-up path (ADR 0016): raise api_cpu, then move Redis to Memorystore and allow api_max_instances > 1."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "api_memory_utilization" {
  project               = var.project_id
  display_name          = "[${var.environment}] api memory utilisation > ${var.api_memory_threshold * 100}% (10m)"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Container memory utilisation (p99 over 5 minutes)"
    condition_threshold {
      filter          = "metric.type = \"run.googleapis.com/container/memory/utilizations\" AND ${local.api_service_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = var.api_memory_threshold
      duration        = "600s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }

      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = "An api container is close to its memory limit (OOM kills restart the instance and drop the Redis sidecar's cache). Raise api_memory (or redis_sidecar_memory) in the environment's tfvars."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ---------------------------------------------------------------------------------------
# Cloud SQL
# ---------------------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "sql_disk" {
  project               = var.project_id
  display_name          = "[${var.environment}] Cloud SQL disk > ${var.sql_disk_threshold * 100}%"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Disk utilisation"
    condition_threshold {
      filter          = "metric.type = \"cloudsql.googleapis.com/database/disk/utilization\" AND resource.type = \"cloudsql_database\" AND resource.label.database_id = \"${var.sql_database_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_disk_threshold
      duration        = "900s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  documentation {
    content   = "Cloud SQL storage auto-resize will grow the disk (and the bill). Check for runaway tables (event_publication, audit_log, job_run) before accepting the growth."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "sql_cpu" {
  project               = var.project_id
  display_name          = "[${var.environment}] Cloud SQL CPU > ${var.sql_cpu_threshold * 100}%"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "CPU utilisation"
    condition_threshold {
      filter          = "metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\" AND resource.type = \"cloudsql_database\" AND resource.label.database_id = \"${var.sql_database_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_cpu_threshold
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "sql_connections" {
  project               = var.project_id
  display_name          = "[${var.environment}] Cloud SQL connections > ${var.sql_connection_threshold} (80% of max_connections)"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "PostgreSQL backends"
    condition_threshold {
      filter          = "metric.type = \"cloudsql.googleapis.com/database/postgresql/num_backends\" AND resource.type = \"cloudsql_database\" AND resource.label.database_id = \"${var.sql_database_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.sql_connection_threshold
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  documentation {
    content   = "Connection saturation. Check HikariCP pool sizing against Cloud SQL max_connections (tier dependent) and Cloud Run max instances × pool size."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ---------------------------------------------------------------------------------------
# Pub/Sub backlog
# ---------------------------------------------------------------------------------------

resource "google_monitoring_alert_policy" "pubsub_oldest_unacked" {
  project               = var.project_id
  display_name          = "[${var.environment}] Pub/Sub oldest unacked message > ${var.pubsub_backlog_threshold_seconds / 60}m"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Oldest unacked message age per subscription"
    condition_threshold {
      filter          = "metric.type = \"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" AND resource.type = \"pubsub_subscription\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.pubsub_backlog_threshold_seconds
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.label.subscription_id"]
      }
    }
  }

  documentation {
    content   = "A push subscription is not being acknowledged (endpoint down, OIDC misconfigured, or handler throwing). See runbook 'Pub/Sub backlog drain'."
    mime_type = "text/markdown"
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ---------------------------------------------------------------------------------------
# Log-based metrics for business failures
# ---------------------------------------------------------------------------------------

resource "google_logging_metric" "business_failures" {
  for_each = var.log_based_metrics

  project     = var.project_id
  name        = each.key
  description = each.value.description
  filter      = "resource.type=\"cloud_run_revision\" AND (jsonPayload.message:\"${each.value.marker}\" OR jsonPayload.event:\"${each.value.marker}\" OR textPayload:\"${each.value.marker}\")"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key         = "service_name"
      value_type  = "STRING"
      description = "Cloud Run service that logged the failure."
    }
  }

  label_extractors = {
    service_name = "EXTRACT(resource.labels.service_name)"
  }
}

resource "google_monitoring_alert_policy" "business_failures" {
  for_each = var.log_based_metrics

  project               = var.project_id
  display_name          = "[${var.environment}] ${each.value.marker} occurred"
  combiner              = "OR"
  severity              = each.value.severity
  notification_channels = local.channels

  conditions {
    display_name = "${each.key} count > ${each.value.threshold} in 5m"
    condition_threshold {
      filter          = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.business_failures[each.key].name}\" AND resource.type = \"cloud_run_revision\""
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
    notification_rate_limit {
      period = "1800s"
    }
  }
}
