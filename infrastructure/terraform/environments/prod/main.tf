# OrenjiTrade prod environment. Composes the shared modules with prod-appropriate sizing.
# Sizing/toggles are variables with prod defaults (variables.tf); project ids, domains and
# the GitHub repository come from terraform.tfvars (copy terraform.tfvars.example).

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

  firebase_project_id = coalesce(var.firebase_project_id, var.project_id)
  media_bucket_name   = coalesce(var.media_bucket_name, "${var.project_id}-media")
  spring_profile      = { dev = "development", staging = "staging", prod = "production" }[var.environment]
}

data "google_project" "this" {
  project_id = var.project_id
}

# ---------------------------------------------------------------------------------------
# Foundations: APIs, identities, GitHub OIDC
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

  project_id     = var.project_id
  region         = var.region
  writer_members = [module.service_accounts.members["github-deployer"]]
  reader_members = var.artifact_registry_reader_members
  labels         = local.labels

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
  connector_name          = "${local.name}-conn"
  connector_machine_type  = var.connector_machine_type
  connector_min_instances = var.connector_min_instances
  connector_max_instances = var.connector_max_instances
  enable_cloud_nat        = true

  depends_on = [module.project_services]
}

resource "random_password" "db_app_user" {
  length  = 32
  special = false # keeps the JDBC URL and libpq parsing trivial
}

resource "random_password" "service_token" {
  length  = 48
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

module "redis" {
  source = "../../modules/redis"

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
  object_viewer_members = [module.service_accounts.members["ml-run"]]
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
      redis-url = {
        description       = "redis:// URL including AUTH for Memorystore (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"]]
        terraform_managed = true
      }
      service-token = {
        description       = "Shared secret for api <-> ml service-to-service calls (generated by Terraform)."
        accessors         = [module.service_accounts.members["api-run"], module.service_accounts.members["ml-run"]]
        terraform_managed = true
      }
      stripe-secret-key = {
        description = "Stripe secret API key (restricted key, Connect enabled). Added by an operator."
        accessors   = [module.service_accounts.members["api-run"]]
      }
      stripe-webhook-secret = {
        description = "Stripe webhook signing secret. Added by an operator."
        accessors   = [module.service_accounts.members["api-run"]]
      }
    },
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
  secret      = module.secrets.secret_names["redis-url"]
  secret_data = module.redis.redis_url
}

resource "google_secret_manager_secret_version" "service_token" {
  secret      = module.secrets.secret_names["service-token"]
  secret_data = random_password.service_token.result
}

# ---------------------------------------------------------------------------------------
# Cloud Run services
# ---------------------------------------------------------------------------------------

module "api" {
  source = "../../modules/cloud-run-service"

  project_id              = var.project_id
  region                  = var.region
  name                    = local.service_names.api
  description             = "OrenjiTrade API (Spring Boot modular monolith)"
  image                   = var.api_image
  service_account_email   = module.service_accounts.emails["api-run"]
  ingress                 = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  container_port          = 8080
  cpu                     = var.api_cpu
  memory                  = var.api_memory
  cpu_idle                = false # outbox workers, WebSocket fan-out, scheduled retries
  startup_cpu_boost       = true
  min_instances           = var.api_min_instances
  max_instances           = var.api_max_instances
  concurrency             = var.api_concurrency
  request_timeout_seconds = 3600 # WebSocket sessions
  session_affinity        = true
  vpc_connector_id        = module.network.connector_id
  vpc_egress              = "ALL_TRAFFIC" # required to reach the internal-only ml service
  allow_unauthenticated   = true          # traffic is admitted by the external LB (+ Cloudflare)
  invoker_members         = [module.service_accounts.members["scheduler"], module.service_accounts.members["pubsub-push"]]
  custom_audiences        = [local.api_url]
  deletion_protection     = var.deletion_protection
  labels                  = local.labels

  env = {
    ORENJI_ENV                      = local.spring_profile
    SPRING_PROFILES_ACTIVE          = local.spring_profile
    DATABASE_URL                    = module.cloud_sql.jdbc_url
    DATABASE_USERNAME               = module.cloud_sql.app_user_name
    FIREBASE_PROJECT_ID             = local.firebase_project_id
    GOOGLE_CLOUD_PROJECT            = var.project_id
    GOOGLE_CLOUD_REGION             = var.region
    GCS_BUCKET_MEDIA                = module.storage.bucket_name
    STORAGE_PROVIDER                = "gcs"
    EVENTS_TRANSPORT                = "pubsub"
    PUBSUB_TOPIC_DOMAIN_EVENTS      = "domain-events"
    PUBSUB_TOPIC_ANALYTICS          = "analytics-events"
    PUBSUB_TOPIC_CARD_SCAN_REQUESTS = "card-scan-requests"
    PAYMENT_PROVIDER                = var.stripe_secrets_enabled ? "stripe" : "fake"
    PUSH_PROVIDER                   = "fcm"
    FCM_PROJECT_ID                  = local.firebase_project_id
    EMAIL_PROVIDER                  = var.email_provider
    EMAIL_FROM                      = var.email_from
    ML_SERVICE_URL                  = module.ml.uri
    ML_SERVICE_TIMEOUT_MS           = "1500"
    CORS_ALLOWED_ORIGINS            = join(",", concat([local.web_url], var.extra_cors_origins))
    WEB_BASE_URL                    = local.web_url
    API_BASE_URL                    = local.api_url
    INTERNAL_JOBS_INVOKER_EMAIL     = module.service_accounts.emails["scheduler"]
    PUBSUB_PUSH_INVOKER_EMAIL       = module.service_accounts.emails["pubsub-push"]
    TRUSTED_PROXY_HEADER            = "CF-Connecting-IP"
    JAVA_TOOL_OPTIONS               = "-XX:MaxRAMPercentage=75 -XX:+UseG1GC"
  }

  secret_env = merge(
    {
      DATABASE_PASSWORD = { secret = module.secrets.secret_ids["db-password"] }
      REDIS_URL         = { secret = module.secrets.secret_ids["redis-url"] }
      SERVICE_TOKEN     = { secret = module.secrets.secret_ids["service-token"] }
    },
    var.stripe_secrets_enabled ? {
      STRIPE_SECRET_KEY     = { secret = module.secrets.secret_ids["stripe-secret-key"] }
      STRIPE_WEBHOOK_SECRET = { secret = module.secrets.secret_ids["stripe-webhook-secret"] }
    } : {}
  )

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
  ]
}

module "web" {
  source = "../../modules/cloud-run-service"

  project_id            = var.project_id
  region                = var.region
  name                  = local.service_names.web
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

  env = {
    API_BASE_URL = local.api_url
  }

  startup_probe = {
    path              = "/"
    period_seconds    = 3
    timeout_seconds   = 2
    failure_threshold = 10
  }

  depends_on = [module.project_services]
}

module "ml" {
  source = "../../modules/cloud-run-service"

  project_id              = var.project_id
  region                  = var.region
  name                    = local.service_names.ml
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
    ORENJI_ENV                = local.spring_profile
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
# Messaging: topics, DLQs, push to Cloud Run, BigQuery streaming
# ---------------------------------------------------------------------------------------

module "pubsub" {
  source = "../../modules/pubsub"

  project_id                  = var.project_id
  project_number              = data.google_project.this.number
  allowed_persistence_regions = [var.region]
  publisher_members           = [module.service_accounts.members["api-run"]]
  labels                      = local.labels

  push_subscriptions = {
    domain-events-api = {
      topic                      = "domain-events"
      push_endpoint              = "${module.api.uri}/internal/events/pubsub"
      oidc_service_account_email = module.service_accounts.emails["pubsub-push"]
      oidc_audience              = module.api.uri
      ack_deadline_seconds       = 60
      max_delivery_attempts      = 5
    }
    card-scan-requests-ml = {
      topic                      = "card-scan-requests"
      push_endpoint              = "${module.ml.uri}/internal/events/pubsub"
      oidc_service_account_email = module.service_accounts.emails["pubsub-push"]
      oidc_audience              = module.ml.uri
      ack_deadline_seconds       = 120
      max_delivery_attempts      = 5
    }
  }

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

  project_id             = var.project_id
  region                 = var.region
  name                   = local.name
  default_backend        = "web"
  enable_ipv6            = var.enable_ipv6
  restrict_to_cloudflare = var.restrict_to_cloudflare
  extra_allowed_ranges   = var.extra_allowed_ranges

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
# Scheduled jobs + monitoring
# ---------------------------------------------------------------------------------------

module "scheduler" {
  source = "../../modules/scheduler"

  project_id            = var.project_id
  region                = var.region
  name_prefix           = "${local.name}-"
  base_url              = coalesce(var.scheduler_base_url, local.api_url)
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
