variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Cloud Scheduler region (must have an App Engine-compatible location, northamerica-northeast1 does)."
  type        = string
  default     = "northamerica-northeast1"
}

variable "name_prefix" {
  description = "Prefix for job names, e.g. orenjitrade-dev-."
  type        = string
  default     = ""
}

variable "base_url" {
  description = "Base URL of the API, e.g. https://api.orenjitrade.com."
  type        = string

  validation {
    condition     = startswith(var.base_url, "https://")
    error_message = "base_url must be an https:// URL."
  }
}

variable "oidc_audience" {
  description = "Audience claim of the OIDC token (defaults to base_url). Must be listed in the api service's custom_audiences."
  type        = string
  default     = null
}

variable "service_account_email" {
  description = "Service account whose identity is asserted in the OIDC token."
  type        = string
}

variable "jobs" {
  description = "Jobs keyed by name. `schedule` is unix-cron; `path` is appended to base_url."
  type = map(object({
    schedule                 = string
    path                     = string
    description              = optional(string, "")
    http_method              = optional(string, "POST")
    time_zone                = optional(string, "Etc/UTC")
    attempt_deadline_seconds = optional(number, 180)
    retry_count              = optional(number, 1)
    body                     = optional(string)
    paused                   = optional(bool, false)
  }))
  default = {
    freshness = {
      schedule    = "15 * * * *"
      path        = "/internal/jobs/freshness"
      description = "Hourly inventory freshness recalculation (ACTIVE -> AGING -> STALE) and warning notifications."
    }
    delist = {
      schedule    = "30 5 * * *"
      path        = "/internal/jobs/delist"
      description = "Daily auto-delisting of stale inventory per delist_policy (ADR 0014)."
    }
  }

  validation {
    condition     = alltrue([for j in var.jobs : startswith(j.path, "/internal/jobs/")])
    error_message = "Every job path must start with /internal/jobs/."
  }

  validation {
    condition     = alltrue([for j in var.jobs : contains(["POST", "GET", "PUT"], j.http_method)])
    error_message = "http_method must be POST, GET or PUT."
  }

  validation {
    condition     = alltrue([for j in var.jobs : j.attempt_deadline_seconds >= 15 && j.attempt_deadline_seconds <= 1800])
    error_message = "attempt_deadline_seconds must be between 15 and 1800."
  }
}
