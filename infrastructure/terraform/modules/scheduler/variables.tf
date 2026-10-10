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
  description = "Base URL of the API the jobs call. The environments pass the api service's run.app URL: Cloud Scheduler is internal ingress for a Cloud Run service of the same project (no Cloudflare/LB hop, Cloud Run IAM enforced), while the OIDC audience stays the public API URL (listed in custom_audiences)."
  type        = string

  validation {
    condition     = startswith(var.base_url, "https://")
    error_message = "base_url must be an https:// URL."
  }
}

variable "oidc_audience" {
  description = "Audience claim of the OIDC token (defaults to base_url). Must be listed in the api service's custom_audiences and equal the API's INTERNAL_AUDIENCE."
  type        = string
  default     = null
}

variable "service_account_email" {
  description = "Service account whose identity is asserted in the OIDC token (must be in the API's INTERNAL_INVOKERS)."
  type        = string
}

# Every scheduled /internal/jobs/* route of apps/api (schedules from the controllers' javadoc,
# docs/api/contracts and the local-profile @Scheduled cadences; minutes staggered so the hourly
# jobs do not all start together). One-off / admin / probe endpoints are deliberately NOT
# scheduled: POST /internal/jobs/ping (connectivity check), POST /internal/jobs/catalog-import
# and GET /internal/jobs/catalog-import/{id} (explicit real-provider import, npm run
# catalog:import), GET /internal/jobs/card-images/status (status), POST
# /internal/jobs/card-images/clear (destructive).
variable "jobs" {
  description = "Jobs keyed by name. `schedule` is unix-cron (UTC); `path` is appended to base_url."
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
      schedule                 = "15 * * * *"
      path                     = "/internal/jobs/freshness"
      description              = "Hourly inventory freshness recalculation (ACTIVE -> AGING -> STALE) and warning notifications (FreshnessJobController, local @Scheduled PT1H)."
      attempt_deadline_seconds = 600
    }
    delist = {
      schedule                 = "30 5 * * *"
      path                     = "/internal/jobs/delist"
      description              = "Daily auto-delisting of stale inventory per delist_policy (ADR 0014; DelistJobController, local @Scheduled P1D)."
      attempt_deadline_seconds = 600
    }
    account-deletion = {
      schedule    = "20 * * * *"
      path        = "/internal/jobs/account-deletion"
      description = "Hourly anonymisation of accounts whose 7-day deletion grace period elapsed (AccountDeletionJobController, local @Scheduled PT1H)."
    }
    offers-expire = {
      schedule    = "5 * * * *"
      path        = "/internal/jobs/offers-expire"
      description = "Hourly expiry of offers past their expiry (OfferJobController, local @Scheduled PT1H)."
    }
    payments-auto-release = {
      schedule    = "25 * * * *"
      path        = "/internal/jobs/payments-auto-release"
      description = "Hourly auto-release of protected payments (PaymentJobController, local @Scheduled PT1H; no-op while payments.auto_release_enabled is off)."
    }
    credits-reconcile = {
      schedule    = "35 * * * *"
      path        = "/internal/jobs/credits-reconcile"
      description = "Hourly credit balance reconciliation against the ledger (CreditJobController, local @Scheduled PT1H)."
    }
    subscriptions-period = {
      schedule    = "40 * * * *"
      path        = "/internal/jobs/subscriptions-period"
      description = "Hourly subscription period roll-over / expiry (BillingJobController, local @Scheduled PT1H)."
    }
    upload-cleanup = {
      schedule    = "2/15 * * * *"
      path        = "/internal/jobs/upload-cleanup"
      description = "Every 15 minutes: delete unattached message uploads older than one hour (UploadCleanupJobController, local @Scheduled PT15M)."
    }
    card-images-reconcile = {
      schedule                 = "45 4 * * *"
      path                     = "/internal/jobs/card-images/reconcile"
      description              = "Daily card image cache reconciliation (ADR 0015; also runs at API start-up). No cadence is documented in the code: daily was chosen because the job is idempotent and keeps usage accounting honest between restarts."
      attempt_deadline_seconds = 900
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

  validation {
    condition     = alltrue([for k, j in var.jobs : !contains(["/internal/jobs/ping", "/internal/jobs/catalog-import", "/internal/jobs/card-images/status", "/internal/jobs/card-images/clear"], j.path)])
    error_message = "ping, catalog-import, card-images/status and card-images/clear are one-off/admin endpoints and must not be scheduled."
  }
}
