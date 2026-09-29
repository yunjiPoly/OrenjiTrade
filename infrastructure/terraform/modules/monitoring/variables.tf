variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "environment" {
  description = "Environment label used in display names (dev, staging, prod)."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod."
  }
}

variable "alert_email" {
  description = "Email address for the notification channel (null = no channel; alerts still exist)."
  type        = string
  default     = null

  validation {
    condition     = var.alert_email == null || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be a valid email address."
  }
}

variable "api_host" {
  description = "Public API hostname for the readiness uptime check."
  type        = string
}

variable "web_host" {
  description = "Public web hostname for the root uptime check."
  type        = string
}

variable "api_service_name" {
  description = "Cloud Run service name of the api (for request metrics)."
  type        = string
}

variable "sql_database_id" {
  description = "Cloud SQL resource label database_id (project:instance)."
  type        = string
}

variable "error_ratio_threshold" {
  description = "5xx ratio that triggers the alert (0.02 = 2%)."
  type        = number
  default     = 0.02

  validation {
    condition     = var.error_ratio_threshold > 0 && var.error_ratio_threshold < 1
    error_message = "error_ratio_threshold must be between 0 and 1."
  }
}

variable "p95_latency_threshold_ms" {
  description = "p95 latency threshold in milliseconds."
  type        = number
  default     = 1500
}

variable "sql_cpu_threshold" {
  description = "Cloud SQL CPU utilisation threshold (0.8 = 80%)."
  type        = number
  default     = 0.8
}

variable "sql_connection_threshold" {
  description = "Absolute backend-connection count that represents 80% of the tier's max_connections."
  type        = number
  default     = 80
}

variable "pubsub_backlog_threshold_seconds" {
  description = "Oldest unacked message age that triggers the backlog alert."
  type        = number
  default     = 600
}

variable "log_based_metrics" {
  description = "Log-based counters keyed by metric name: the log marker to count, alert threshold and severity."
  type = map(object({
    marker      = string
    description = string
    threshold   = optional(number, 0)
    severity    = optional(string, "ERROR")
  }))
  default = {
    payment_webhook_failed = {
      marker      = "payment.webhook.failed"
      description = "Stripe webhook could not be verified or processed."
      severity    = "CRITICAL"
    }
    notification_delivery_failed = {
      marker      = "notification.delivery.failed"
      description = "Push/email delivery failed after retries."
      severity    = "WARNING"
    }
  }

  validation {
    condition     = alltrue([for m in var.log_based_metrics : contains(["CRITICAL", "ERROR", "WARNING"], m.severity)])
    error_message = "severity must be CRITICAL, ERROR or WARNING."
  }
}
