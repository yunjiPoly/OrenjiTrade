variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "secrets" {
  description = <<-EOT
    Secrets to create, keyed by secret id. `accessors` are IAM members granted
    roles/secretmanager.secretAccessor on that secret only. `terraform_managed` marks secrets
    whose versions are written by Terraform (annotation only; helps operators).
  EOT
  type = map(object({
    description       = string
    accessors         = optional(list(string), [])
    terraform_managed = optional(bool, false)
  }))

  validation {
    condition     = alltrue([for k, _ in var.secrets : can(regex("^[A-Za-z0-9_-]{1,255}$", k))])
    error_message = "Secret ids may only contain letters, digits, hyphens and underscores."
  }
}

variable "version_destroy_ttl" {
  description = "Delay before a destroyed secret version is actually deleted (lets you undo a bad rotation)."
  type        = string
  default     = "604800s" # 7 days
}

variable "labels" {
  description = "Labels applied to every secret."
  type        = map(string)
  default     = {}
}
