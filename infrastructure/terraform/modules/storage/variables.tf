variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique bucket name, e.g. <project_id>-media."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name must be 3-63 chars of lowercase letters, digits, dots, hyphens, underscores."
  }
}

variable "location" {
  description = "Bucket location (region or multi-region)."
  type        = string
  default     = "northamerica-northeast1"
}

variable "cors_origins" {
  description = "Origins allowed to upload directly to signed URLs (web app + Expo dev origins)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for o in var.cors_origins : can(regex("^(https?://[^/]+|\\*)$", o))])
    error_message = "Every CORS origin must be an origin (scheme://host[:port]) or *."
  }
}

variable "tmp_prefix" {
  description = "Object prefix whose contents are deleted automatically."
  type        = string
  default     = "tmp/"
}

variable "tmp_prefix_ttl_days" {
  description = "Days after which objects under tmp_prefix are deleted."
  type        = number
  default     = 2

  validation {
    condition     = var.tmp_prefix_ttl_days >= 1
    error_message = "tmp_prefix_ttl_days must be at least 1."
  }
}

variable "versioning_enabled" {
  description = "Keep non-current object versions (prod)."
  type        = bool
  default     = false
}

variable "keep_noncurrent_versions" {
  description = "Number of non-current versions to keep when versioning is enabled."
  type        = number
  default     = 3
}

variable "soft_delete_retention_days" {
  description = "Soft-delete retention (0 disables, otherwise 7-90 days)."
  type        = number
  default     = 7

  validation {
    condition     = var.soft_delete_retention_days == 0 || (var.soft_delete_retention_days >= 7 && var.soft_delete_retention_days <= 90)
    error_message = "soft_delete_retention_days must be 0 or between 7 and 90."
  }
}

variable "force_destroy" {
  description = "Allow terraform destroy to delete a non-empty bucket (dev only)."
  type        = bool
  default     = false
}

variable "object_admin_members" {
  description = "IAM members granted roles/storage.objectAdmin (the API runtime service account)."
  type        = list(string)
  default     = []
}

variable "object_viewer_members" {
  description = "IAM members granted roles/storage.objectViewer (the ML runtime service account)."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels applied to the bucket."
  type        = map(string)
  default     = {}
}
