variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Repository location."
  type        = string
  default     = "northamerica-northeast1"
}

variable "repository_id" {
  description = "Repository id (last path segment of the image name)."
  type        = string
  default     = "orenjitrade"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,62}$", var.repository_id))
    error_message = "repository_id must start with a letter and contain lowercase letters, digits and hyphens."
  }
}

variable "untagged_retention_days" {
  description = "Delete untagged images older than this many days."
  type        = number
  default     = 14
}

variable "keep_tagged_versions" {
  description = "Always keep this many most recent versions per image."
  type        = number
  default     = 20
}

variable "cleanup_policy_dry_run" {
  description = "Log what cleanup would delete without deleting."
  type        = bool
  default     = false
}

variable "writer_members" {
  description = "IAM members allowed to push (github-deployer SA)."
  type        = list(string)
  default     = []
}

variable "reader_members" {
  description = "IAM members allowed to pull (Cloud Run runtime SAs when pulling across projects)."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels applied to the repository."
  type        = map(string)
  default     = {}
}
