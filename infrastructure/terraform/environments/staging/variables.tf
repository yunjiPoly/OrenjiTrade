# staging sizing and toggles: prod topology (ADR 0016) at prod-like sizes but scale-to-zero and no
# deletion protection, so the environment can be brought up for a release check and destroyed
# afterwards (it is NOT provisioned by default; see infrastructure/terraform/README.md).
# Project ids, domains, public web config and the GitHub repository belong in terraform.tfvars.

variable "project_id" {
  description = "GCP project id of the staging environment."
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
  description = "Environment name (fixed to staging for this root module)."
  type        = string
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "This root module is the staging environment; do not repurpose it."
  }
}

variable "web_host" {
  description = "Public web hostname served by the load balancer."
  type        = string
  default     = "staging.orenjitrade.com"

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.web_host))
    error_message = "web_host must be a hostname."
  }
}

variable "api_host" {
  description = "Public API hostname served by the load balancer."
  type        = string
  default     = "staging-api.orenjitrade.com"

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
  description = "Email for the Cloud Monitoring notification channel and the billing budget (null = alerts without a channel)."
  type        = string
  default     = null
}

variable "billing_account_id" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) for the US$ monthly budget. null = no budget resource (set it only in the owner's tfvars: creating a budget needs billing-account permissions)."
  type        = string
  default     = null
}

variable "monthly_budget_usd" {
  description = "Monthly budget (USD, list price before credits) that triggers the 50/90/100% actual and 100% forecast emails."
  type        = number
  default     = 150
}

variable "firebase_project_id" {
  description = "Firebase / Identity Platform project id (null = same as project_id)."
  type        = string
  default     = null
}

# --- Public web configuration (rendered into the web container's config.json; no secrets) --

variable "firebase_web_api_key" {
  description = "Firebase web API key (public; Firebase console > Project settings > Your apps > Web app). Restrict it to the web host in Google Cloud > APIs & Services > Credentials."
  type        = string
  default     = ""
}

variable "firebase_web_app_id" {
  description = "Firebase web app id (public, 1:<number>:web:<hash>)."
  type        = string
  default     = ""
}

variable "firebase_auth_domain" {
  description = "Firebase Auth domain (null = <firebase project id>.firebaseapp.com)."
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
  default     = []
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

variable "artifact_registry_keep_versions" {
  description = "Most recent image versions kept per image (api, web) by the Artifact Registry cleanup policy; older tagged versions are deleted after 30 days, v* tags always kept."
  type        = number
  default     = 10
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
  default     = true
}

variable "certificate_mode" {
  description = "Load balancer certificate: certificate_manager (Google-managed with DNS authorization; works behind the Cloudflare proxy), self_managed (Cloudflare Origin CA PEM from origin_certificate / origin_certificate_secret_ids) or compute_managed (classic HTTP validation; only when Cloudflare does not proxy)."
  type        = string
  default     = "certificate_manager"

  validation {
    condition     = contains(["certificate_manager", "self_managed", "compute_managed"], var.certificate_mode)
    error_message = "certificate_mode must be certificate_manager, self_managed or compute_managed."
  }
}

variable "origin_certificate" {
  description = "certificate_mode = self_managed: PEM certificate + private key (e.g. Cloudflare Origin CA). Put them only in the git-ignored terraform.tfvars, never in the repository."
  type = object({
    certificate_pem = string
    private_key_pem = string
  })
  default   = null
  sensitive = true
}

variable "origin_certificate_secret_ids" {
  description = "certificate_mode = self_managed alternative: Secret Manager secret ids (latest version read at plan time) holding the PEM certificate and private key."
  type = object({
    certificate = string
    private_key = string
  })
  default = null
}

variable "enable_ipv6" {
  description = "Reserve an IPv6 LB address as well."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Deletion protection on Cloud SQL, Memorystore (if any), BigQuery table and Cloud Run services."
  type        = bool
  default     = false
}

variable "stripe_secrets_enabled" {
  description = "Mount stripe-secret-key / stripe-webhook-secret into the API (PAYMENT_PROVIDER=stripe). Add the secret versions first or the revision will fail to start."
  type        = bool
  default     = false
}

variable "billing_provider" {
  description = "BILLING_PROVIDER for subscriptions: fake or stripe (stripe needs stripe_secrets_enabled, a stripe-billing-webhook-secret version and stripe_price_premium)."
  type        = string
  default     = "fake"

  validation {
    condition     = contains(["fake", "stripe"], var.billing_provider)
    error_message = "billing_provider must be fake or stripe."
  }

  validation {
    condition     = var.billing_provider == "fake" || var.stripe_secrets_enabled
    error_message = "billing_provider = stripe requires stripe_secrets_enabled = true."
  }
}

variable "stripe_price_premium" {
  description = "Stripe price id of the PREMIUM plan (not a secret; required when billing_provider = stripe)."
  type        = string
  default     = ""

  validation {
    condition     = var.billing_provider != "stripe" || can(regex("^price_[A-Za-z0-9]+$", var.stripe_price_premium))
    error_message = "stripe_price_premium must be a Stripe price id (price_...) when billing_provider is stripe."
  }
}

variable "firebase_service_account_secret_enabled" {
  description = "Create the optional firebase-service-account secret (only when ADC is not sufficient)."
  type        = bool
  default     = false
}

variable "email_provider" {
  description = "EMAIL_PROVIDER for the API. Only `log` is implemented (NotificationProviderConfig refuses sendgrid/ses at start-up)."
  type        = string
  default     = "log"

  validation {
    condition     = contains(["log"], var.email_provider)
    error_message = "email_provider must be log (sendgrid/ses adapters are not implemented yet)."
  }
}

variable "email_from" {
  description = "EMAIL_FROM for transactional email."
  type        = string
  default     = "no-reply@orenjitrade.com"
}

variable "scheduler_base_url" {
  description = "Override the base URL Cloud Scheduler calls (default: the api service's run.app URL, internal ingress)."
  type        = string
  default     = null
}

variable "pubsub_domain_events_push_enabled" {
  description = "Create the domain-events push subscription to /internal/events/pubsub. Keep false until the API implements that receiver (ADR 0009 Pub/Sub adapter)."
  type        = bool
  default     = false
}

variable "ml_enabled" {
  description = "Instantiate the ML Cloud Run service, its push subscription and its storage access. ON HOLD by owner instruction (CLAUDE.md): keep false. Enabling it also requires enable_vpc_connector = true, enable_cloud_nat = true and api_vpc_egress = ALL_TRAFFIC."
  type        = bool
  default     = false

  validation {
    condition     = !var.ml_enabled || (var.enable_vpc_connector && var.enable_cloud_nat && var.api_vpc_egress == "ALL_TRAFFIC")
    error_message = "ml_enabled requires enable_vpc_connector = true, enable_cloud_nat = true and api_vpc_egress = \"ALL_TRAFFIC\" (internal-only ingress is only reachable through the VPC)."
  }
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

# --- Networking ---------------------------------------------------------------------------

variable "direct_vpc_subnet_cidr" {
  description = "Subnet for Cloud Run Direct VPC egress (/26 or larger)."
  type        = string
  default     = "10.9.0.0/24"
}

variable "enable_vpc_connector" {
  description = "Create the Serverless VPC Access connector and attach the api to it instead of Direct VPC egress (needed only for ALL_TRAFFIC egress / the ML service)."
  type        = bool
  default     = false
}

variable "enable_cloud_nat" {
  description = "Create Cloud NAT (only useful with ALL_TRAFFIC egress)."
  type        = bool
  default     = false
}

variable "api_vpc_egress" {
  description = "PRIVATE_RANGES_ONLY (Cloud SQL through the VPC, public calls straight out) or ALL_TRAFFIC (needs Cloud NAT; required to reach the internal-only ML service)."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"

  validation {
    condition     = contains(["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], var.api_vpc_egress)
    error_message = "api_vpc_egress must be PRIVATE_RANGES_ONLY or ALL_TRAFFIC."
  }
}

variable "connector_machine_type" {
  description = "Serverless VPC Access connector machine type (when enabled)."
  type        = string
  default     = "e2-micro"
}

variable "connector_min_instances" {
  description = "Connector minimum instances (when enabled)."
  type        = number
  default     = 2
}

variable "connector_max_instances" {
  description = "Connector maximum instances (when enabled)."
  type        = number
  default     = 3
}

# --- Cloud SQL -----------------------------------------------------------------------------

variable "sql_tier" {
  description = "Cloud SQL tier. db-g1-small (shared core, 1.7 GB, max_connections 50) for year one; db-custom-1-3840 is the first SLA-covered step up."
  type        = string
  default     = "db-g1-small"
}

variable "sql_edition" {
  description = "Cloud SQL edition, set explicitly because PostgreSQL 16+ defaults to ENTERPRISE_PLUS (no shared-core tiers, higher price)."
  type        = string
  default     = "ENTERPRISE"
}

variable "sql_availability_type" {
  description = "Cloud SQL availability (ZONAL, or REGIONAL for HA at twice the instance price)."
  type        = string
  default     = "ZONAL"
}

variable "sql_disk_size_gb" {
  description = "Cloud SQL initial SSD size (auto-resize is on; never shrunk by Terraform)."
  type        = number
  default     = 10
}

variable "sql_transaction_log_retention_days" {
  description = "Days of PITR transaction logs (7 is the Cloud SQL Enterprise edition maximum; ENTERPRISE_PLUS allows up to 35)."
  type        = number
  default     = 7
}

variable "sql_retained_backups" {
  description = "Automated daily backups kept."
  type        = number
  default     = 7
}

variable "sql_connection_alert_threshold" {
  description = "Backend connections that equal 80% of the tier's max_connections (db-g1-small: 50 => 40)."
  type        = number
  default     = 40
}

variable "api_db_pool_size" {
  description = "DATABASE_POOL_SIZE (HikariCP maximum pool size) of each api instance. Flyway shares the pool. Keep instances x pool + superuser_reserved_connections (3) + Cloud SQL's own sessions + admin headroom under the tier's max_connections (50 on db-g1-small)."
  type        = number
  default     = 10

  validation {
    condition     = var.api_db_pool_size >= 2 && var.api_db_pool_size <= 200
    error_message = "api_db_pool_size must be between 2 and 200."
  }
}

# --- Redis ---------------------------------------------------------------------------------

variable "redis_mode" {
  description = "sidecar: Valkey container inside the api instance (localhost, no persistence, api_max_instances must be 1). memorystore: Memorystore for Redis over Private Service Access (scale-up path, allows api_max_instances > 1)."
  type        = string
  default     = "sidecar"

  validation {
    condition     = contains(["sidecar", "memorystore"], var.redis_mode)
    error_message = "redis_mode must be sidecar or memorystore."
  }
}

variable "redis_sidecar_image" {
  description = "Docker Hub repository of the sidecar image, pulled through the Artifact Registry remote repository."
  type        = string
  default     = "valkey/valkey"
}

variable "redis_sidecar_image_tag" {
  description = "Pinned tag of the sidecar image (informative when a digest is set)."
  type        = string
  default     = "8.1.10-alpine"

  validation {
    condition     = var.redis_sidecar_image_tag != "latest"
    error_message = "Pin a version; :latest is not allowed."
  }
}

variable "redis_sidecar_image_digest" {
  description = "Pinned manifest digest of the sidecar image (valkey/valkey:8.1.10-alpine on 2026-10-05). null = pull by tag."
  type        = string
  default     = "sha256:081c2f5cb575efc901aa80ff9cdbd1ec6a301682fd35e1ebb4b0990a4a4a8507"

  validation {
    condition     = var.redis_sidecar_image_digest == null || can(regex("^sha256:[0-9a-f]{64}$", var.redis_sidecar_image_digest))
    error_message = "redis_sidecar_image_digest must look like sha256:<64 hex>."
  }
}

variable "redis_sidecar_cpu" {
  description = "CPU limit of the Valkey sidecar (fractional). 0.1 vCPU is ample for a cache of a few thousand users. To confirm at the first apply: Cloud Run documents that less than 1 vCPU requires request-based billing and concurrency 1 without saying whether that is judged per container or per instance; if 0.1 is rejected next to the 1 vCPU api container, prefer redis_mode = memorystore (Basic 1 GiB ~ US$38/month) over a full-vCPU sidecar (~ US$51/month more)."
  type        = string
  default     = "0.1"
}

variable "redis_sidecar_memory" {
  description = "Memory limit of the Valkey sidecar (>= maxmemory + overhead; 512Mi is also the GEN2 per-container minimum)."
  type        = string
  default     = "512Mi"
}

variable "redis_sidecar_maxmemory_mb" {
  description = "Valkey maxmemory in MB (allkeys-lru eviction above it)."
  type        = number
  default     = 200
}

variable "redis_sidecar_bind_address" {
  description = "Addresses Valkey listens on. Loopback only; `-::1` tolerates a missing IPv6 loopback. Fallback if Cloud Run's TCP startup probe cannot reach the loopback: \"0.0.0.0\" (still unreachable from outside: only the api container's port is exposed)."
  type        = string
  default     = "127.0.0.1 -::1"
}

variable "redis_sidecar_privilege_drop" {
  description = "Prefix that drops root before exec'ing valkey-server (the valkey Alpine image ships setpriv and the valkey user 999:1000). Empty string = run as root."
  type        = string
  default     = "setpriv --reuid 999 --regid 1000 --clear-groups --"
}

variable "redis_tier" {
  description = "Memorystore tier when redis_mode = memorystore (BASIC or STANDARD_HA)."
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  description = "Memorystore memory in GB when redis_mode = memorystore (BASIC minimum 1, STANDARD_HA minimum 5)."
  type        = number
  default     = 1
}

variable "redis_replica_count" {
  description = "Memorystore read replicas (STANDARD_HA only)."
  type        = number
  default     = 0
}

variable "redis_persistence_enabled" {
  description = "Memorystore RDB snapshots (when redis_mode = memorystore)."
  type        = bool
  default     = false
}

# --- Cloud Run sizing ----------------------------------------------------------------------

variable "api_cpu" {
  description = "api CPU limit."
  type        = string
  default     = "1"
}

variable "api_memory" {
  description = "api container memory limit (the Valkey sidecar has its own). Measured locally (Docker, 1 vCPU / 1 GiB, not in the cloud) on 2026-10-05 on the production image with the prod profile: 513 MiB RSS idle after start-up, 595 MiB RSS (588 MiB cgroup peak) under ~36 req/s of mixed public + authenticated load, live heap after GC <= 108 MiB, committed heap <= 209 MiB, i.e. ~390 MiB is non-heap (metaspace, code cache, threads, Netty/gRPC buffers). 1 GiB leaves ~40% headroom with the heap capped at 50% (api_java_tool_options); raise to 1.5Gi/2Gi when the memory utilisation alert (85%) fires."
  type        = string
  default     = "1Gi"
}

variable "api_java_tool_options" {
  description = "JAVA_TOOL_OPTIONS of the api container. The heap is capped at 50% of the container limit (512 MiB at 1Gi): the measured live heap is ~100 MiB and the measured non-heap footprint ~390 MiB, so a 75% cap (768 MiB) plus non-heap could exceed the container and be OOM-killed by the kernel instead of ending in a logged OutOfMemoryError (-XX:+ExitOnOutOfMemoryError in the Dockerfile). The in-memory file system (card image downloads, <= 10 MiB) lives in the remainder. Keep the share when raising api_memory."
  type        = string
  default     = "-XX:MaxRAMPercentage=50 -XX:+UseG1GC"
}

variable "api_min_instances" {
  description = "api minimum instances (0 = scale to zero between uses; prod keeps 1)."
  type        = number
  default     = 0
}

variable "api_max_instances" {
  description = "api maximum instances. Must be 1 while redis_mode = sidecar (a localhost cache cannot fan out realtime events or share rate-limit counters across instances)."
  type        = number
  default     = 1

  validation {
    condition     = var.redis_mode != "sidecar" || var.api_max_instances == 1
    error_message = "api_max_instances must be 1 with redis_mode = sidecar; switch to redis_mode = memorystore to scale out."
  }
}

variable "api_concurrency" {
  description = "api concurrent requests per instance."
  type        = number
  default     = 80
}

variable "web_memory" {
  description = "web memory limit (nginx; 512Mi is the GEN2 minimum)."
  type        = string
  default     = "512Mi"
}

variable "web_min_instances" {
  description = "web minimum instances (0 = scale to zero; cold start of the nginx image is well under a second)."
  type        = number
  default     = 0
}

variable "web_max_instances" {
  description = "web maximum instances."
  type        = number
  default     = 2
}

variable "ml_cpu" {
  description = "ml CPU limit (when ml_enabled)."
  type        = string
  default     = "2"
}

variable "ml_memory" {
  description = "ml memory limit (when ml_enabled)."
  type        = string
  default     = "2Gi"
}

variable "ml_min_instances" {
  description = "ml minimum instances (when ml_enabled)."
  type        = number
  default     = 0
}

variable "ml_max_instances" {
  description = "ml maximum instances (when ml_enabled)."
  type        = number
  default     = 5
}

variable "ml_log_level" {
  description = "LOG_LEVEL for the ml service."
  type        = string
  default     = "INFO"
}

# --- Storage / analytics -------------------------------------------------------------------

variable "storage_versioning_enabled" {
  description = "Object versioning on the media bucket."
  type        = bool
  default     = false
}

variable "storage_force_destroy" {
  description = "Allow destroying a non-empty media bucket."
  type        = bool
  default     = false
}

variable "analytics_partition_expiration_days" {
  description = "BigQuery partition expiry (null = keep forever)."
  type        = number
  default     = 180
}
