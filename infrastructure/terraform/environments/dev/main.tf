# OrenjiTrade dev environment. Composes the shared modules with dev-appropriate sizing.
# Sizing/toggles are variables with dev defaults (variables.tf); project ids, domains and
# the GitHub repository come from terraform.tfvars (copy terraform.tfvars.example).
#
# Low-cost first-year profile (ADR 0016): Cloud SQL db-g1-small ZONAL (Enterprise edition),
# Redis as a Valkey sidecar of the single api instance, Direct VPC egress (no connector, no
# NAT), web scaled to zero, Certificate Manager (DNS authorization) behind Cloudflare, no ML
# service. The larger topology stays reachable through variables: redis_mode = "memorystore",
# api_max_instances > 1, sql_availability_type = "REGIONAL", ml_enabled = true.
# The three environment roots share this file; only variables.tf differs.

locals {
  name = "orenjitrade-${var.environment}"

  labels = merge({
    app         = "orenjitrade"
    environment = var.environment
    managed_by  = "terraform"
  }, var.labels)

  web_url = "https://${var.web_host}"
  api_url = "https://${var.api_host}"

  service_names = {
    api = "orenjitrade-api-${var.environment}"
    web = "orenjitrade-web-${var.environment}"
    ml  = "orenjitrade-ml-${var.environment}"
  }

  firebase_project_id  = coalesce(var.firebase_project_id, var.project_id)
  firebase_auth_domain = coalesce(var.firebase_auth_domain, "${local.firebase_project_id}.firebaseapp.com")
  media_bucket_name    = coalesce(var.media_bucket_name, "${var.project_id}-media")

  # apps/api/src/main/resources/application.yml defines the profile documents dev | staging |
  # prod (SPRING_PROFILES_ACTIVE); orenji.environment (ORENJI_ENV, GET /api/v1/meta) uses the
  # long names. The two must not be confused: with an unknown profile the prod document (pool
  # size, no default service token, ECS logging) would silently not apply.
  spring_profile     = var.environment
  orenji_environment = { dev = "development", staging = "staging", prod = "production" }[var.environment]

  redis_sidecar = var.redis_mode == "sidecar"
  memorystore   = var.redis_mode == "memorystore"

  # Valkey/Redis sidecar image pulled through the Artifact Registry remote repository; pinned
  # by digest (the tag is only informative once a digest is set).
  redis_sidecar_image = (
    var.redis_sidecar_image_digest == null
    ? "${module.artifact_registry.dockerhub_repository_url}/${var.redis_sidecar_image}:${var.redis_sidecar_image_tag}"
    : "${module.artifact_registry.dockerhub_repository_url}/${var.redis_sidecar_image}@${var.redis_sidecar_image_digest}"
  )

  # Non-persistent, loopback-only cache (CLAUDE.md: Redis is never primary storage). `save ''`
  # disables RDB snapshots (which would otherwise be written to the in-memory file system and
  # count against the container's memory); the shell wrapper exists so that the empty
  # argument reaches valkey-server intact and so that the process drops root with setpriv.
  redis_sidecar_command = join(" ", compact([
    "exec",
    var.redis_sidecar_privilege_drop,
    "valkey-server",
    "--bind ${var.redis_sidecar_bind_address}",
    "--port 6379",
    "--protected-mode yes",
    "--save ''",
    "--appendonly no",
    "--maxmemory ${var.redis_sidecar_maxmemory_mb}mb",
    "--maxmemory-policy allkeys-lru",
    "--loglevel notice",
  ]))

  billing_stripe = var.billing_provider == "stripe"

  # Self-managed origin certificate (certificate_mode = self_managed) from tfvars or Secret Manager.
  self_managed_certificate = (
    var.origin_certificate != null ? var.origin_certificate : (
      var.origin_certificate_secret_ids != null ? {
        certificate_pem = data.google_secret_manager_secret_version_access.origin_certificate[0].secret_data
        private_key_pem = data.google_secret_manager_secret_version_access.origin_private_key[0].secret_data
      } : null
    )
  )
}

data "google_project" "this" {
  project_id = var.project_id
}

data "google_secret_manager_secret_version_access" "origin_certificate" {
  count = var.origin_certificate_secret_ids == null ? 0 : 1

  project = var.project_id
  secret  = var.origin_certificate_secret_ids.certificate
}

data "google_secret_manager_secret_version_access" "origin_private_key" {
  count = var.origin_certificate_secret_ids == null ? 0 : 1

  project = var.project_id
  secret  = var.origin_certificate_secret_ids.private_key
}

# ---------------------------------------------------------------------------------------
# Foundations: APIs, identities, GitHub OIDC, registries
# ---------------------------------------------------------------------------------------

module "project_services" {
  source = "../../modules/project-services"

  project_id = var.project_id
}

module "service_accounts" {
  source = "../../modules/service-accounts"

  project_id = var.project_id

  depends_on = [module.project_services]
}

module "github_wif" {
  source = "../../modules/github-wif"

  project_id                    = var.project_id
  github_repository             = var.github_repository
  allowed_refs                  = var.wif_allowed_refs
  deployer_service_account_name = module.service_accounts.names["github-deployer"]

  depends_on = [module.project_services]
}

module "artifact_registry" {
  source = "../../modules/artifact-registry"

  project_id              = var.project_id
  region                  = var.region
  writer_members          = [module.service_accounts.members["github-deployer"]]
  reader_members          = var.artifact_registry_reader_members
  keep_tagged_versions    = var.artifact_registry_keep_versions
  create_dockerhub_remote = local.redis_sidecar
  labels                  = local.labels

  depends_on = [module.project_services]
}

# ---------------------------------------------------------------------------------------
# Network + data stores
# ---------------------------------------------------------------------------------------

module "network" {
  source = "../../modules/network"

  project_id              = var.project_id
  region                  = var.region
  network_name            = local.name
  direct_vpc_subnet_cidr  = var.direct_vpc_subnet_cidr
  enable_connector        = var.enable_vpc_connector
  connector_name          = "${local.name}-conn"
  connector_machine_type  = var.connector_machine_type
  connector_min_instances = var.connector_min_instances
  connector_max_instances = var.connector_max_instances
  enable_cloud_nat        = var.enable_cloud_nat

  depends_on = [module.project_services]
}

resource "random_password" "db_app_user" {
  length  = 32
  special = false # keeps the JDBC URL and libpq parsing trivial
}

# Application secrets the API refuses to start without (ServiceTokenStartupValidator,
# AnalyticsConfig, AdsConfig) plus the consent IP salt. Generated once, stored in Secret Manager,
# never in tfvars. (The location jitter secret went with the coordinates, ADR 0017.)
resource "random_password" "service_token" {
  length  = 48
  special = false
}

resource "random_password" "analytics_actor_salt" {
  length  = 64
  special = false
}

resource "random_password" "ads_token_secret" {
  length  = 64
  special = false
}

resource "random_password" "consent_ip_salt" {
  length  = 64
  special = false
}

module "cloud_sql" {
  source = "../../modules/cloud-sql"

  project_id                     = var.project_id
  region                         = var.region
  instance_name                  = local.name
  network_id                     = module.network.network_id
  allocated_ip_range             = module.network.private_service_access_range_name
  tier                           = var.sql_tier
  edition                        = var.sql_edition
  availability_type              = var.sql_availability_type
  disk_size_gb                   = var.sql_disk_size_gb
  deletion_protection            = var.deletion_protection
  point_in_time_recovery_enabled = true
  transaction_log_retention_days = var.sql_transaction_log_retention_days
  retained_backups               = var.sql_retained_backups
  app_user_password              = random_password.db_app_user.result
  labels                         = local.labels

  depends_on = [module.network]
}

# Memorystore only on the scale-up path (redis_mode = "memorystore"); the low-cost profile
# runs a Valkey sidecar inside the api instance (see module "api").
module "redis" {
  source = "../../modules/redis"
  count  = local.memorystore ? 1 : 0

  project_id          = var.project_id
  region              = var.region
  instance_name       = local.name
  display_name        = "OrenjiTrade ${var.environment}"
  network_id          = module.network.network_id
  tier                = var.redis_tier
  memory_size_gb      = var.redis_memory_size_gb
  replica_count       = var.redis_replica_count
  persistence_enabled = var.redis_persistence_enabled
  deletion_protection = var.deletion_protection
  labels              = local.labels

  depends_on = [module.network]
}

module "storage" {
  source = "../../modules/storage"

  project_id            = var.project_id
  bucket_name           = local.media_bucket_name
  location              = var.region
  cors_origins          = concat([local.web_url], var.extra_cors_origins)
  versioning_enabled    = var.storage_versioning_enabled
  force_destroy         = var.storage_force_destroy
  object_admin_members  = [module.service_accounts.members["api-run"]]
  object_viewer_members = var.ml_enabled ? [module.service_accounts.members["ml-run"]] : []
  labels                = local.labels

  depends_on = [module.project_services]
}

module "bigquery" {
  source = "../../modules/bigquery"

  project_id                = var.project_id
  project_number            = data.google_project.this.number
  location                  = var.region
  deletion_protection       = var.deletion_protection
  partition_expiration_days = var.analytics_partition_expiration_days
  reader_members            = var.analytics_reader_members
  labels                    = local.labels

  depends_on = [module.project_services]
}

# ---------------------------------------------------------------------------------------
# Secrets: containers + Terraform-generated values. Operator-provided values (Stripe,
# optional Firebase service account) are added with gcloud (docs/deployment/README.md).
# ---------------------------------------------------------------------------------------

module "secrets" {
  source = "../../modules/secrets"

  project_id = var.project_id
  labels     = local.labels

  secrets = merge(
    {
      db-password = {
        description       = "Cloud SQL application user password (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"]]
        terraform_managed = true
      }
      service-token = {
        description       = "Shared secret for /internal/** service calls (generated by Terraform)."
        accessors         = concat([module.service_accounts.members["api-run"]], var.ml_enabled ? [module.service_accounts.members["ml-run"]] : [])
        terraform_managed = true
      }
      analytics-actor-salt = {
        description       = "HMAC key pseudonymising account ids in analytics events (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"]]
        terraform_managed = true
      }
      ads-token-secret = {
        description       = "HMAC key of ad serve tokens (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"]]
        terraform_managed = true
      }
      consent-ip-salt = {
        description       = "Salt of the hashed client IP stored with consents (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"]]
        terraform_managed = true
      }
      stripe-secret-key = {
        description = "Stripe secret API key (restricted key, Connect enabled). Added by an operator."
        accessors   = [module.service_accounts.members["api-run"]]
      }
      stripe-webhook-secret = {
        description = "Stripe payments webhook signing secret. Added by an operator."
        accessors   = [module.service_accounts.members["api-run"]]
      }
      stripe-billing-webhook-secret = {
        description = "Stripe billing (subscriptions) webhook signing secret. Added by an operator."
        accessors   = [module.service_accounts.members["api-run"]]
      }
    },
    local.memorystore ? {
      redis-url = {
        description       = "redis:// URL including AUTH for Memorystore (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"]]
        terraform_managed = true
      }
    } : {},
    var.firebase_service_account_secret_enabled ? {
      firebase-service-account = {
        description = "Optional Firebase Admin SDK service-account JSON; only when ADC cannot be used."
        accessors   = [module.service_accounts.members["api-run"]]
      }
    } : {}
  )

  depends_on = [module.project_services]
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = module.secrets.secret_names["db-password"]
  secret_data = random_password.db_app_user.result
}

resource "google_secret_manager_secret_version" "redis_url" {
  count = local.memorystore ? 1 : 0

  secret      = module.secrets.secret_names["redis-url"]
  secret_data = module.redis[0].redis_url
}

resource "google_secret_manager_secret_version" "service_token" {
  secret      = module.secrets.secret_names["service-token"]
  secret_data = random_password.service_token.result
}

resource "google_secret_manager_secret_version" "analytics_actor_salt" {
  secret      = module.secrets.secret_names["analytics-actor-salt"]
  secret_data = random_password.analytics_actor_salt.result
}

resource "google_secret_manager_secret_version" "ads_token_secret" {
  secret      = module.secrets.secret_names["ads-token-secret"]
  secret_data = random_password.ads_token_secret.result
}

resource "google_secret_manager_secret_version" "consent_ip_salt" {
  secret      = module.secrets.secret_names["consent-ip-salt"]
  secret_data = random_password.consent_ip_salt.result
}

# ---------------------------------------------------------------------------------------
# Cloud Run services
# ---------------------------------------------------------------------------------------

module "api" {
  source = "../../modules/cloud-run-service"

  project_id              = var.project_id
  region                  = var.region
  name                    = local.service_names.api
  container_name          = "api"
  description             = "OrenjiTrade API (Spring Boot modular monolith)"
  image                   = var.api_image
  service_account_email   = module.service_accounts.emails["api-run"]
  ingress                 = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  container_port          = 8080
  cpu                     = var.api_cpu
  memory                  = var.api_memory
  cpu_idle                = false # outbox workers, WebSocket fan-out, scheduled retries, the Redis sidecar
  startup_cpu_boost       = true
  min_instances           = var.api_min_instances
  max_instances           = var.api_max_instances
  concurrency             = var.api_concurrency
  request_timeout_seconds = 3600 # WebSocket sessions
  session_affinity        = true
  # Direct VPC egress: Cloud SQL's private IP through the VPC, everything else (Firebase,
  # Stripe, card providers) straight to the internet. The connector/NAT path is only needed
  # with ALL_TRAFFIC egress (internal-only ML service).
  vpc_connector_id      = var.enable_vpc_connector ? module.network.connector_id : null
  vpc_network           = var.enable_vpc_connector ? null : module.network.network_name
  vpc_subnetwork        = var.enable_vpc_connector ? null : module.network.direct_vpc_subnet_name
  vpc_egress            = var.api_vpc_egress
  allow_unauthenticated = true # traffic is admitted by the external LB (+ Cloudflare)
  invoker_members       = [module.service_accounts.members["scheduler"], module.service_accounts.members["pubsub-push"]]
  custom_audiences      = [local.api_url]
  deletion_protection   = var.deletion_protection
  labels                = local.labels

  env = merge(
    {
      ORENJI_ENV             = local.orenji_environment
      SPRING_PROFILES_ACTIVE = local.spring_profile
      DATABASE_URL           = module.cloud_sql.jdbc_url
      DATABASE_USERNAME      = module.cloud_sql.app_user_name
      DATABASE_POOL_SIZE     = tostring(var.api_db_pool_size)
      FIREBASE_PROJECT_ID    = local.firebase_project_id
      GOOGLE_CLOUD_PROJECT   = var.project_id
      GOOGLE_CLOUD_REGION    = var.region
      STORAGE_PROVIDER       = "gcs"
      GCS_BUCKET_MEDIA       = module.storage.bucket_name
      # The media bucket enforces public access prevention, so public media URLs must point at
      # the API (GET /api/v1/public/media/{key} reads from GCS; Cloudflare caches the response).
      STORAGE_PUBLIC_BASE_URL = "${local.api_url}/api/v1/public/media"
      # Card image cache (ADR 0015): with STORAGE_PROVIDER=gcs the renditions are objects under
      # card-images/ of the media bucket (the cap, 5 GB, counts them from PostgreSQL); only the
      # in-flight downloads touch the instance's in-memory disk, so an explicit tmpfs path.
      CARD_IMAGE_CACHE_DIR       = "/tmp/card-images"
      EVENTS_TRANSPORT           = "pubsub"
      PUBSUB_TOPIC_DOMAIN_EVENTS = "domain-events"
      PUBSUB_TOPIC_ANALYTICS     = "analytics-events"
      PAYMENT_PROVIDER           = var.stripe_secrets_enabled ? "stripe" : "fake"
      BILLING_PROVIDER           = var.billing_provider
      DONATION_PROVIDER          = "fake"
      PUSH_PROVIDER              = "fcm"
      EMAIL_PROVIDER             = var.email_provider
      EMAIL_FROM                 = var.email_from
      CORS_ALLOWED_ORIGINS       = join(",", concat([local.web_url], var.extra_cors_origins))
      WEB_BASE_URL               = local.web_url
      API_BASE_URL               = local.api_url
      ADS_WEB_BASE_URL           = local.web_url
      # /internal/** callers: Google OIDC tokens minted for the public API URL (custom audience of
      # the service) by the scheduler and pubsub-push service accounts.
      INTERNAL_AUDIENCE = local.api_url
      INTERNAL_INVOKERS = join(",", [module.service_accounts.emails["scheduler"], module.service_accounts.emails["pubsub-push"]])
      JAVA_TOOL_OPTIONS = var.api_java_tool_options
    },
    local.redis_sidecar ? { REDIS_URL = "redis://localhost:6379" } : {},
    local.billing_stripe ? { STRIPE_PRICE_PREMIUM = var.stripe_price_premium } : {},
    var.ml_enabled ? { ML_SERVICE_URL = module.ml[0].uri, ML_SERVICE_TIMEOUT_MS = "1500" } : {}
  )

  secret_env = merge(
    {
      DATABASE_PASSWORD    = { secret = module.secrets.secret_ids["db-password"] }
      SERVICE_TOKEN        = { secret = module.secrets.secret_ids["service-token"] }
      ANALYTICS_ACTOR_SALT = { secret = module.secrets.secret_ids["analytics-actor-salt"] }
      ADS_TOKEN_SECRET     = { secret = module.secrets.secret_ids["ads-token-secret"] }
      CONSENT_IP_SALT      = { secret = module.secrets.secret_ids["consent-ip-salt"] }
    },
    local.memorystore ? {
      REDIS_URL = { secret = module.secrets.secret_ids["redis-url"] }
    } : {},
    var.stripe_secrets_enabled ? {
      STRIPE_SECRET_KEY     = { secret = module.secrets.secret_ids["stripe-secret-key"] }
      STRIPE_WEBHOOK_SECRET = { secret = module.secrets.secret_ids["stripe-webhook-secret"] }
    } : {},
    local.billing_stripe ? {
      STRIPE_BILLING_WEBHOOK_SECRET = { secret = module.secrets.secret_ids["stripe-billing-webhook-secret"] }
    } : {}
  )

  # Valkey sidecar: loopback only, no persistence, ~200 MB LRU. The api container depends on
  # it (started only after the TCP probe on 6379 passes) and keeps `redis` in its readiness
  # group, so the instance never receives traffic without its cache.
  sidecars = local.redis_sidecar ? [
    {
      name    = "valkey"
      image   = local.redis_sidecar_image
      cpu     = var.redis_sidecar_cpu
      memory  = var.redis_sidecar_memory
      command = ["/bin/sh", "-c"]
      args    = [local.redis_sidecar_command]
      startup_probe = {
        tcp_port          = 6379
        period_seconds    = 2
        timeout_seconds   = 2
        failure_threshold = 15
      }
    }
  ] : []

  startup_probe = {
    path                  = "/actuator/health/readiness"
    initial_delay_seconds = 10
    period_seconds        = 5
    timeout_seconds       = 3
    failure_threshold     = 36 # JVM + Flyway can take a while on the smallest tier
  }

  liveness_probe = {
    path              = "/actuator/health/liveness"
    period_seconds    = 30
    timeout_seconds   = 3
    failure_threshold = 3
  }

  depends_on = [
    google_secret_manager_secret_version.db_password,
    google_secret_manager_secret_version.redis_url,
    google_secret_manager_secret_version.service_token,
    google_secret_manager_secret_version.analytics_actor_salt,
    google_secret_manager_secret_version.ads_token_secret,
    google_secret_manager_secret_version.consent_ip_salt,
  ]
}

module "web" {
  source = "../../modules/cloud-run-service"

  project_id            = var.project_id
  region                = var.region
  name                  = local.service_names.web
  container_name        = "web"
  description           = "OrenjiTrade web (Angular build served by nginx)"
  image                 = var.web_image
  service_account_email = module.service_accounts.emails["web-run"]
  ingress               = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  container_port        = 8080
  cpu                   = "1"
  memory                = var.web_memory
  cpu_idle              = true
  min_instances         = var.web_min_instances
  max_instances         = var.web_max_instances
  concurrency           = 200
  allow_unauthenticated = true
  deletion_protection   = var.deletion_protection
  labels                = local.labels

  # Every variable apps/web-angular/docker-entrypoint.sh renders into config.json and the nginx
  # CSP. All of them are public web configuration (the Firebase web config is restricted by
  # authorized domain); no secret may appear here. No map key: the region map is a bundled
  # static asset (ADR 0017).
  env = {
    API_BASE_URL                = local.api_url
    WS_BASE_URL                 = "wss://${var.api_host}/ws"
    FIREBASE_API_KEY            = var.firebase_web_api_key
    FIREBASE_AUTH_DOMAIN        = local.firebase_auth_domain
    FIREBASE_PROJECT_ID         = local.firebase_project_id
    FIREBASE_APP_ID             = var.firebase_web_app_id
    FIREBASE_AUTH_EMULATOR_HOST = ""
    ENVIRONMENT                 = local.orenji_environment
  }

  startup_probe = {
    path              = "/healthz"
    period_seconds    = 3
    timeout_seconds   = 2
    failure_threshold = 10
  }

  depends_on = [module.project_services]
}

# ML card recognition is ON HOLD (CLAUDE.md): the module stays reusable but is not
# instantiated unless ml_enabled = true (which also needs the connector + NAT path, because
# the api must route ALL_TRAFFIC through the VPC to reach an internal-only service).
module "ml" {
  source = "../../modules/cloud-run-service"
  count  = var.ml_enabled ? 1 : 0

  project_id              = var.project_id
  region                  = var.region
  name                    = local.service_names.ml
  container_name          = "ml"
  description             = "OrenjiTrade ML (FastAPI: card identification, duplicate detection)"
  image                   = var.ml_image
  service_account_email   = module.service_accounts.emails["ml-run"]
  ingress                 = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  container_port          = 8080
  cpu                     = var.ml_cpu
  memory                  = var.ml_memory
  cpu_idle                = true
  min_instances           = var.ml_min_instances
  max_instances           = var.ml_max_instances
  concurrency             = 8
  request_timeout_seconds = 120
  allow_unauthenticated   = false
  invoker_members         = [module.service_accounts.members["api-run"], module.service_accounts.members["pubsub-push"]]
  deletion_protection     = var.deletion_protection
  labels                  = local.labels

  env = {
    ORENJI_ENV                = local.orenji_environment
    API_BASE_URL              = local.api_url
    GOOGLE_CLOUD_PROJECT      = var.project_id
    MEDIA_BUCKET              = module.storage.bucket_name
    PUBSUB_PUSH_INVOKER_EMAIL = module.service_accounts.emails["pubsub-push"]
    LOG_LEVEL                 = var.ml_log_level
  }

  secret_env = {
    SERVICE_TOKEN = { secret = module.secrets.secret_ids["service-token"] }
  }

  startup_probe = {
    path              = "/health"
    period_seconds    = 5
    timeout_seconds   = 3
    failure_threshold = 24
  }

  depends_on = [google_secret_manager_secret_version.service_token]
}

# ---------------------------------------------------------------------------------------
# Messaging: topics, DLQs, BigQuery streaming (+ push subscriptions when their receivers exist)
# ---------------------------------------------------------------------------------------

module "pubsub" {
  source = "../../modules/pubsub"

  project_id                  = var.project_id
  project_number              = data.google_project.this.number
  allowed_persistence_regions = [var.region]
  publisher_members           = [module.service_accounts.members["api-run"]]
  labels                      = local.labels

  # domain-events: the API publishes domain events through the Spring Modulith outbox and has
  # no /internal/events/pubsub receiver yet (ADR 0009 adapter pending), so the push
  # subscription is off by default (an undeliverable push would only fill the DLQ and trip
  # the backlog alert). card-scan-requests belongs to the ML service (on hold).
  push_subscriptions = merge(
    var.pubsub_domain_events_push_enabled ? {
      domain-events-api = {
        topic                      = "domain-events"
        push_endpoint              = "${module.api.uri}/internal/events/pubsub"
        oidc_service_account_email = module.service_accounts.emails["pubsub-push"]
        oidc_audience              = local.api_url # = INTERNAL_AUDIENCE, accepted by Cloud Run IAM through custom_audiences
        ack_deadline_seconds       = 60
        max_delivery_attempts      = 5
      }
    } : {},
    var.ml_enabled ? {
      card-scan-requests-ml = {
        topic                      = "card-scan-requests"
        push_endpoint              = "${module.ml[0].uri}/internal/events/pubsub"
        oidc_service_account_email = module.service_accounts.emails["pubsub-push"]
        oidc_audience              = module.ml[0].uri
        ack_deadline_seconds       = 120
        max_delivery_attempts      = 5
      }
    } : {}
  )

  bigquery_subscriptions = {
    analytics-events-bigquery = {
      topic = "analytics-events"
      table = module.bigquery.events_table_reference
    }
  }

  depends_on = [module.bigquery]
}

# ---------------------------------------------------------------------------------------
# Edge: global HTTPS load balancer (Cloudflare points at ipv4_address)
# ---------------------------------------------------------------------------------------

module "load_balancer" {
  source = "../../modules/load-balancer"

  project_id               = var.project_id
  region                   = var.region
  name                     = local.name
  default_backend          = "web"
  certificate_mode         = var.certificate_mode
  self_managed_certificate = local.self_managed_certificate
  enable_ipv6              = var.enable_ipv6
  restrict_to_cloudflare   = var.restrict_to_cloudflare
  extra_allowed_ranges     = var.extra_allowed_ranges
  labels                   = local.labels

  backends = {
    api = {
      cloud_run_service_name = module.api.name
      hosts                  = [var.api_host]
      timeout_sec            = 3600
    }
    web = {
      cloud_run_service_name = module.web.name
      hosts                  = [var.web_host]
      timeout_sec            = 60
      log_sample_rate        = 0.1
    }
  }
}

# ---------------------------------------------------------------------------------------
# Scheduled jobs, monitoring, cost guardrail
# ---------------------------------------------------------------------------------------

module "scheduler" {
  source = "../../modules/scheduler"

  project_id  = var.project_id
  region      = var.region
  name_prefix = "${local.name}-"
  # Cloud Scheduler reaches the api's run.app URL as internal ingress (same project): no
  # Cloudflare / load balancer hop, Cloud Run IAM enforced. The OIDC audience stays the public
  # API URL, which is both a custom audience of the service and the API's INTERNAL_AUDIENCE.
  base_url              = coalesce(var.scheduler_base_url, module.api.uri)
  oidc_audience         = local.api_url
  service_account_email = module.service_accounts.emails["scheduler"]

  depends_on = [module.api]
}

module "monitoring" {
  source = "../../modules/monitoring"

  project_id               = var.project_id
  environment              = var.environment
  alert_email              = var.alert_email
  api_host                 = var.api_host
  web_host                 = var.web_host
  api_service_name         = module.api.name
  sql_database_id          = module.cloud_sql.database_id
  sql_connection_threshold = var.sql_connection_alert_threshold

  depends_on = [module.project_services]
}

# Applied once by the owner (needs billing-account permissions); see modules/billing-budget.
module "billing_budget" {
  source = "../../modules/billing-budget"
  count  = var.billing_account_id == null ? 0 : 1

  billing_account_id    = var.billing_account_id
  project_number        = data.google_project.this.number
  display_name          = "OrenjiTrade ${var.environment} monthly budget"
  amount_units          = var.monthly_budget_usd
  notification_channels = var.alert_email == null ? [] : [module.monitoring.notification_channel_id]

  depends_on = [module.project_services]
}
