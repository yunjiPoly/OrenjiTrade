output "load_balancer_ipv4" {
  description = "Point the Cloudflare A records (www/api) at this address."
  value       = module.load_balancer.ipv4_address
}

output "load_balancer_ipv6" {
  description = "IPv6 address when enable_ipv6 is true."
  value       = module.load_balancer.ipv6_address
}

output "certificate" {
  description = "Certificate mode, resource name and domains."
  value = {
    mode    = module.load_balancer.certificate_mode
    name    = module.load_balancer.certificate_name
    domains = module.load_balancer.certificate_domains
  }
}

output "certificate_dns_authorizations" {
  description = "CNAME records to create DNS-only (not proxied) in Cloudflare for Certificate Manager DNS authorization; paste into infrastructure/cloudflare/terraform `certificate_dns_authorizations`."
  value       = module.load_balancer.dns_authorization_records
}

output "web_url" {
  description = "Public web URL."
  value       = local.web_url
}

output "api_url" {
  description = "Public API URL."
  value       = local.api_url
}

output "cloud_run_services" {
  description = "Cloud Run service names, main container names and default URLs (ml only when ml_enabled)."
  value = merge(
    {
      api = { name = module.api.name, container = module.api.container_name, uri = module.api.uri, sidecars = module.api.sidecar_names }
      web = { name = module.web.name, container = module.web.container_name, uri = module.web.uri, sidecars = [] }
    },
    var.ml_enabled ? { ml = { name = module.ml[0].name, container = module.ml[0].container_name, uri = module.ml[0].uri, sidecars = [] } } : {}
  )
}

output "cloud_sql" {
  description = "Cloud SQL instance identifiers (private IP only)."
  value = {
    instance_name   = module.cloud_sql.instance_name
    connection_name = module.cloud_sql.connection_name
    private_ip      = module.cloud_sql.private_ip_address
    database        = module.cloud_sql.database_name
    tier            = var.sql_tier
    edition         = var.sql_edition
    availability    = var.sql_availability_type
  }
}

output "redis" {
  description = "Redis topology: sidecar (localhost inside the api instance) or the Memorystore endpoint."
  value = {
    mode = var.redis_mode
    host = local.memorystore ? "${module.redis[0].host}:${module.redis[0].port}" : "localhost:6379 (valkey sidecar, ${var.redis_sidecar_maxmemory_mb} MB allkeys-lru, no persistence)"
  }
}

output "media_bucket" {
  description = "GCS media bucket name."
  value       = module.storage.bucket_name
}

output "artifact_registry_url" {
  description = "Image prefix for docker push/pull."
  value       = module.artifact_registry.repository_url
}

output "dockerhub_remote_repository_url" {
  description = "Artifact Registry remote repository caching Docker Hub (sidecar image), null when not created."
  value       = module.artifact_registry.dockerhub_repository_url
}

output "github_workload_identity_provider" {
  description = "GitHub repository/environment variable GCP_WORKLOAD_IDENTITY_PROVIDER."
  value       = module.github_wif.workload_identity_provider
}

output "github_deployer_service_account" {
  description = "GitHub repository/environment variable GCP_DEPLOYER_SA."
  value       = module.service_accounts.emails["github-deployer"]
}

output "service_account_emails" {
  description = "All service account emails."
  value       = module.service_accounts.emails
}

output "secrets_to_populate" {
  description = "Secrets that need a first version added by an operator before enabling the features that use them."
  value       = module.secrets.operator_managed_secret_ids
}

output "pubsub" {
  description = "Topics and subscriptions."
  value = {
    topics         = module.pubsub.topic_names
    push           = module.pubsub.push_subscription_names
    bigquery       = module.pubsub.bigquery_subscription_names
    dlq_inspect    = module.pubsub.dead_letter_inspect_subscription_names
    bigquery_table = module.bigquery.events_table_reference
  }
}

output "scheduler_jobs" {
  description = "Cloud Scheduler job names."
  value       = module.scheduler.job_names
}

output "monitoring" {
  description = "Uptime check ids and alert policy names."
  value = {
    uptime_checks  = module.monitoring.uptime_check_ids
    alert_policies = module.monitoring.alert_policy_names
  }
}

output "billing_budget" {
  description = "Billing budget name and amount (null when billing_account_id is unset)."
  value       = var.billing_account_id == null ? null : { name = module.billing_budget[0].budget_name, amount = module.billing_budget[0].amount }
}

output "cloud_armor_policy" {
  description = "Cloud Armor policy restricting the LB to Cloudflare (null when disabled)."
  value       = module.load_balancer.security_policy_name
}
