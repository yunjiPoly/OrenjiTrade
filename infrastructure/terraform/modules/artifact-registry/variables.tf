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

variable "tagged_retention_days" {
  description = "Delete tagged images older than this many days unless a KEEP policy (most recent versions, v* release tags) retains them."
  type        = number
  default     = 30

  validation {
    condition     = var.tagged_retention_days >= 1
    error_message = "tagged_retention_days must be at least 1."
  }
}

variable "keep_tagged_versions" {
  description = "Always keep this many most recent versions per image (api, web, ml)."
  type        = number
  default     = 10

  validation {
    condition     = var.keep_tagged_versions >= 1
    error_message = "keep_tagged_versions must be at least 1."
  }
}

variable "keep_package_name_prefixes" {
  description = "Image name prefixes the most-recent-versions KEEP policy applies to (empty = every image in the repository)."
  type        = list(string)
  default     = []
}

variable "cleanup_policy_dry_run" {
  description = "Log what cleanup would delete without deleting."
  type        = bool
  default     = false
}

variable "create_dockerhub_remote" {
  description = "Create a REMOTE repository caching Docker Hub (for the pinned Valkey/Redis sidecar image)."
  type        = bool
  default     = false
}

variable "dockerhub_repository_id" {
  description = "Repository id of the Docker Hub remote repository."
  type        = string
  default     = "dockerhub"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,62}$", var.dockerhub_repository_id))
    error_message = "dockerhub_repository_id must start with a letter and contain lowercase letters, digits and hyphens."
  }
}

variable "dockerhub_upstream_credentials" {
  description = "Optional Docker Hub credentials for the remote repository: { username, password_secret_version = projects/../secrets/../versions/.. }. null = anonymous pulls."
  type = object({
    username                = string
    password_secret_version = string
  })
  default = null
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
  description = "Labels applied to the repositories."
  type        = map(string)
  default     = {}
}
