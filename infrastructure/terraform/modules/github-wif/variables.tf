variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to authenticate, as owner/name (e.g. orenjitrade/orenjitrade)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be in the form owner/name."
  }
}

variable "allowed_refs" {
  description = "Optional list of git refs allowed to authenticate (e.g. [\"refs/heads/main\"]). Empty = any ref of the repository."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for r in var.allowed_refs : startswith(r, "refs/")])
    error_message = "allowed_refs entries must start with refs/."
  }
}

variable "pool_id" {
  description = "Workload identity pool id."
  type        = string
  default     = "github"

  validation {
    condition     = can(regex("^[a-z0-9-]{4,32}$", var.pool_id)) && !startswith(var.pool_id, "gcp-")
    error_message = "pool_id must be 4-32 chars of lowercase letters, digits, hyphens and must not start with gcp-."
  }
}

variable "provider_id" {
  description = "Workload identity pool provider id."
  type        = string
  default     = "github-oidc"

  validation {
    condition     = can(regex("^[a-z0-9-]{4,32}$", var.provider_id)) && !startswith(var.provider_id, "gcp-")
    error_message = "provider_id must be 4-32 chars of lowercase letters, digits, hyphens and must not start with gcp-."
  }
}

variable "deployer_service_account_name" {
  description = "Full resource name of the deployer SA (projects/<project>/serviceAccounts/<email>)."
  type        = string

  validation {
    condition     = can(regex("^projects/[^/]+/serviceAccounts/.+@.+$", var.deployer_service_account_name))
    error_message = "deployer_service_account_name must be projects/<project>/serviceAccounts/<email>."
  }
}
