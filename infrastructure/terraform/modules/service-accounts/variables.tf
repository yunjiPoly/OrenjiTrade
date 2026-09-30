variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "name_prefix" {
  description = "Prefix for every account id (e.g. \"orenjitrade-\")."
  type        = string
  default     = ""
}

variable "service_accounts" {
  description = <<-EOT
    Service accounts keyed by short name. `project_roles` are project-level IAM roles; `act_as`
    lists other keys in this map the account may impersonate (roles/iam.serviceAccountUser),
    used by the deployer to deploy Cloud Run services with their runtime SA.
  EOT
  type = map(object({
    display_name  = string
    description   = optional(string, "")
    project_roles = optional(list(string), [])
    act_as        = optional(list(string), [])
  }))
  default = {
    api-run = {
      display_name  = "OrenjiTrade API runtime"
      description   = "Runtime identity of the api Cloud Run service."
      project_roles = ["roles/cloudsql.client", "roles/logging.logWriter", "roles/monitoring.metricWriter", "roles/cloudtrace.agent", "roles/firebaseauth.admin", "roles/firebasecloudmessaging.admin"]
    }
    web-run = {
      display_name  = "OrenjiTrade web runtime"
      description   = "Runtime identity of the web (nginx) Cloud Run service."
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    ml-run = {
      display_name  = "OrenjiTrade ML runtime"
      description   = "Runtime identity of the ml Cloud Run service."
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter", "roles/cloudtrace.agent"]
    }
    scheduler = {
      display_name  = "OrenjiTrade Cloud Scheduler invoker"
      description   = "Mints OIDC tokens for /internal/jobs/* calls."
      project_roles = []
    }
    pubsub-push = {
      display_name  = "OrenjiTrade Pub/Sub push invoker"
      description   = "Mints OIDC tokens for Pub/Sub push deliveries to Cloud Run."
      project_roles = []
    }
    github-deployer = {
      display_name  = "OrenjiTrade GitHub Actions deployer"
      description   = "Impersonated through Workload Identity Federation; pushes images and deploys Cloud Run."
      project_roles = ["roles/run.developer"]
      act_as        = ["api-run", "web-run", "ml-run"]
    }
  }

  validation {
    condition     = alltrue([for k, _ in var.service_accounts : can(regex("^[a-z]([-a-z0-9]{4,28})[a-z0-9]$", k))])
    error_message = "Service account keys must be 6-30 chars: lowercase letters, digits, hyphens."
  }

  validation {
    condition     = alltrue(flatten([for _, sa in var.service_accounts : [for r in sa.project_roles : startswith(r, "roles/")]]))
    error_message = "project_roles must be predefined roles (roles/...)."
  }
}
