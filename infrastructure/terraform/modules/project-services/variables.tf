variable "project_id" {
  description = "GCP project id in which to enable the APIs."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid GCP project id (6-30 chars, lowercase letters, digits, hyphens)."
  }
}

variable "services" {
  description = "APIs to enable. The default covers every service used by the OrenjiTrade environments."
  type        = list(string)
  default = [
    "artifactregistry.googleapis.com",
    "bigquery.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtrace.googleapis.com",
    "compute.googleapis.com",
    "fcm.googleapis.com",
    "firebase.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "redis.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "sts.googleapis.com",
    "vpcaccess.googleapis.com",
  ]

  validation {
    condition     = alltrue([for s in var.services : can(regex("^[a-z0-9-]+\\.googleapis\\.com$", s))])
    error_message = "Every service must be a *.googleapis.com API name."
  }
}

variable "disable_on_destroy" {
  description = "Disable the APIs when the resource is destroyed. Keep false outside throw-away projects."
  type        = bool
  default     = false
}
