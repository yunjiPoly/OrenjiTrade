# dev sizing and toggles: smallest shared-core tier; scale-to-zero everywhere; no HA; no deletion protection.
# Project ids, domains and the GitHub repository belong in terraform.tfvars.

variable "project_id" {
  description = "GCP project id of the dev environment."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be a valid GCP project id."
  }
}

variable "region" {
  description = "Primary region for every regional resource."
  type        = string
  default     = "northamerica-northeast1"
}

variable "environment" {
  description = "Environment name (fixed to dev for this root module)."
  type        = string
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "This root module is the dev environment; do not repurpose it."
  }
}

variable "web_host" {
  description = "Public web hostname served by the load balancer."
  type        = string
  default     = "dev.orenjitrade.com"

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.web_host))
    error_message = "web_host must be a hostname."
  }
}

variable "api_host" {
  description = "Public API hostname served by the load balancer."
  type        = string
  default     = "dev-api.orenjitrade.com"

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.api_host))
    error_message = "api_host must be a hostname."
  }
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to deploy through Workload Identity Federation."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be owner/name."
  }
}

variable "wif_allowed_refs" {
  description = "Git refs allowed to impersonate the deployer SA (empty = any ref of the repository)."
  type        = list(string)
  default     = []
}

variable "alert_email" {
  description = "Email for the Cloud Monitoring notification channel (null = alerts without a channel)."
  type        = string
  default     = null
}

variable "firebase_project_id" {
  description = "Firebase / Identity Platform project id (null = same as project_id)."
  type        = string
  default     = null
}

variable "media_bucket_name" {
  description = "Media bucket name (null = <project_id>-media)."
  type        = string
  default     = null
}

variable "extra_cors_origins" {
  description = "Additional origins allowed for uploads and API CORS besides the web host."
  type        = list(string)
  default     = ["http://localhost:4200", "http://localhost:8081", "http://localhost:19006"]
}

variable "extra_allowed_ranges" {
  description = "Extra CIDR ranges admitted by Cloud Armor when restrict_to_cloudflare is true."
  type        = list(string)
  default     = []
}

variable "artifact_registry_reader_members" {
  description = "IAM members allowed to pull from this project's registry (Cloud Run service agents of other environments that deploy images built here)."
  type        = list(string)
  default     = []
}

variable "analytics_reader_members" {
  description = "IAM members granted BigQuery dataViewer on the analytics dataset."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Extra labels merged into every resource."
  type        = map(string)
  default     = {}
}

# --- Toggles ----------------------------------------------------------------------------

variable "restrict_to_cloudflare" {
  description = "Only admit Cloudflare edge ranges at the load balancer (Cloud Armor)."
  type        = bool
  default     = false
}

variable "enable_ipv6" {
  description = "Reserve an IPv6 LB address as well."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Deletion protection on Cloud SQL, Redis, BigQuery table and Cloud Run services."
  type        = bool
  default     = false
}

variable "stripe_secrets_enabled" {
  description = "Mount stripe-secret-key / stripe-webhook-secret into the API (PAYMENT_PROVIDER=stripe). Add the secret versions first or the revision will fail to start."
  type        = bool
  default     = false
}

variable "firebase_service_account_secret_enabled" {
  description = "Create the optional firebase-service-account secret (only when ADC is not sufficient)."
  type        = bool
  default     = false
}

variable "email_provider" {
  description = "EMAIL_PROVIDER for the API (log | sendgrid | ses)."
  type        = string
  default     = "log"

  validation {
    condition     = contains(["log", "sendgrid", "ses"], var.email_provider)
    error_message = "email_provider must be log, sendgrid or ses."
  }
}

variable "email_from" {
  description = "EMAIL_FROM for transactional email."
  type        = string
  default     = "no-reply@orenjitrade.com"
}

variable "scheduler_base_url" {
  description = "Override the base URL Cloud Scheduler calls (defaults to https://<api_host>)."
  type        = string
  default     = null
}

# --- Images (placeholders; CI deploys real images and Terraform ignores later changes) --

variable "api_image" {
  description = "Initial api image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "web_image" {
  description = "Initial web image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "ml_image" {
  description = "Initial ml image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

# --- Sizing -----------------------------------------------------------------------------

variable "sql_tier" {
  description = "Cloud SQL tier."
  type        = string
  default     = "db-f1-micro"
}

variable "sql_availability_type" {
  description = "Cloud SQL availability (ZONAL or REGIONAL)."
  type        = string
  default     = "ZONAL"
}

variable "sql_disk_size_gb" {
  description = "Cloud SQL initial disk size."
  type        = number
  default     = 10
}

variable "sql_transaction_log_retention_days" {
  description = "Days of PITR transaction logs."
  type        = number
  default     = 7
}

variable "sql_retained_backups" {
  description = "Automated backups kept."
  type        = number
  default     = 7
}

variable "sql_connection_alert_threshold" {
  description = "Backend connections that equal 80% of the tier's max_connections."
  type        = number
  default     = 20
}

variable "redis_tier" {
  description = "Memorystore tier (BASIC or STANDARD_HA)."
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Memorystore memory in GB."
  type        = number
  default     = 1
}

variable "redis_replica_count" {
  description = "Memorystore read replicas (STANDARD_HA only)."
  type        = number
  default     = 0
}

variable "redis_persistence_enabled" {
  description = "Memorystore RDB snapshots."
  type        = bool
  default     = false
}

variable "api_cpu" {
  description = "api CPU limit."
  type        = string
  default     = "1"
}

variable "api_memory" {
  description = "api memory limit."
  type        = string
  default     = "1Gi"
}

variable "api_min_instances" {
  description = "api minimum instances."
  type        = number
  default     = 0
}

variable "api_max_instances" {
  description = "api maximum instances."
  type        = number
  default     = 3
}

variable "api_concurrency" {
  description = "api concurrent requests per instance."
  type        = number
  default     = 80
}

variable "web_memory" {
  description = "web memory limit."
  type        = string
  default     = "256Mi"
}

variable "web_min_instances" {
  description = "web minimum instances."
  type        = number
  default     = 0
}

variable "web_max_instances" {
  description = "web maximum instances."
  type        = number
  default     = 3
}

variable "ml_cpu" {
  description = "ml CPU limit."
  type        = string
  default     = "1"
}

variable "ml_memory" {
  description = "ml memory limit."
  type        = string
  default     = "1Gi"
}

variable "ml_min_instances" {
  description = "ml minimum instances."
  type        = number
  default     = 0
}

variable "ml_max_instances" {
  description = "ml maximum instances."
  type        = number
  default     = 2
}

variable "ml_log_level" {
  description = "LOG_LEVEL for the ml service."
  type        = string
  default     = "INFO"
}

variable "connector_machine_type" {
  description = "Serverless VPC Access connector machine type."
  type        = string
  default     = "e2-micro"
}

variable "connector_min_instances" {
  description = "Connector minimum instances."
  type        = number
  default     = 2
}

variable "connector_max_instances" {
  description = "Connector maximum instances."
  type        = number
  default     = 3
}

variable "storage_versioning_enabled" {
  description = "Object versioning on the media bucket."
  type        = bool
  default     = false
}

variable "storage_force_destroy" {
  description = "Allow destroying a non-empty media bucket."
  type        = bool
  default     = true
}

variable "analytics_partition_expiration_days" {
  description = "BigQuery partition expiry (null = keep forever)."
  type        = number
  default     = 90
}
