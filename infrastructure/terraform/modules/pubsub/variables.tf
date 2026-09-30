variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "project_number" {
  description = "Numeric project number (for the Pub/Sub service agent identity)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must be numeric."
  }
}

variable "topics" {
  description = "Topic names to create. Each gets a matching <name>-dlq dead-letter topic."
  type        = list(string)
  default     = ["domain-events", "analytics-events", "card-scan-requests"]

  validation {
    condition     = alltrue([for t in var.topics : can(regex("^[A-Za-z][A-Za-z0-9._~%+-]{2,254}$", t))])
    error_message = "Topic names must be 3-255 chars and start with a letter."
  }
}

variable "allowed_persistence_regions" {
  description = "Regions where messages may be stored (data residency)."
  type        = list(string)
  default     = ["northamerica-northeast1"]
}

variable "message_retention_duration" {
  description = "How long unacked messages are retained on topics/subscriptions."
  type        = string
  default     = "604800s" # 7 days
}

variable "dead_letter_retention_duration" {
  description = "Retention on dead-letter topics and their inspect subscriptions."
  type        = string
  default     = "1209600s" # 14 days
}

variable "publisher_members" {
  description = "IAM members allowed to publish to every topic (API runtime SA)."
  type        = list(string)
  default     = []
}

variable "push_subscriptions" {
  description = "Push subscriptions keyed by subscription name."
  type = map(object({
    topic                      = string
    push_endpoint              = string
    oidc_service_account_email = string
    oidc_audience              = optional(string)
    ack_deadline_seconds       = optional(number, 60)
    max_delivery_attempts      = optional(number, 5)
    filter                     = optional(string)
  }))
  default = {}

  validation {
    condition     = alltrue([for s in var.push_subscriptions : startswith(s.push_endpoint, "https://")])
    error_message = "push_endpoint must be an https:// URL."
  }

  validation {
    condition     = alltrue([for s in var.push_subscriptions : s.max_delivery_attempts >= 5 && s.max_delivery_attempts <= 100])
    error_message = "max_delivery_attempts must be between 5 and 100."
  }
}

variable "bigquery_subscriptions" {
  description = "BigQuery subscriptions keyed by subscription name. table is project.dataset.table."
  type = map(object({
    topic = string
    table = string
  }))
  default = {}

  validation {
    condition     = alltrue([for s in var.bigquery_subscriptions : can(regex("^[^.]+\\.[^.]+\\.[^.]+$", s.table))])
    error_message = "table must be in the form project.dataset.table."
  }
}

variable "labels" {
  description = "Labels applied to topics and subscriptions."
  type        = map(string)
  default     = {}
}
