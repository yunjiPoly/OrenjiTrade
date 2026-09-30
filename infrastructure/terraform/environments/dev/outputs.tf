output "load_balancer_ipv4" {
  description = "Point the Cloudflare A records (www/api) at this address."
  value       = module.load_balancer.ipv4_address
}

output "load_balancer_ipv6" {
  description = "IPv6 address when enable_ipv6 is true."
  value       = module.load_balancer.ipv6_address
}

output "managed_certificate" {
  description = "Google-managed certificate name and domains (must reach ACTIVE after DNS is set)."
  value = {
    name    = module.load_balancer.certificate_name
    domains = module.load_balancer.certificate_domains
  }
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
  description = "Cloud Run service names and default URLs."
  value = {
    api = { name = module.api.name, uri = module.api.uri }
    web = { name = module.web.name, uri = module.web.uri }
    ml  = { name = module.ml.name, uri = module.ml.uri }
  }
}

output "cloud_sql" {
  description = "Cloud SQL instance identifiers (private IP only)."
  value = {
    instance_name   = module.cloud_sql.instance_name
    connection_name = module.cloud_sql.connection_name
    private_ip      = module.cloud_sql.private_ip_address
    database        = module.cloud_sql.database_name
  }
}

output "redis_host" {
  description = "Memorystore private endpoint."
  value       = "${module.redis.host}:${module.redis.port}"
}

output "media_bucket" {
  description = "GCS media bucket name."
  value       = module.storage.bucket_name
}

output "artifact_registry_url" {
  description = "Image prefix for docker push/pull."
  value       = module.artifact_registry.repository_url
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

output "cloud_armor_policy" {
  description = "Cloud Armor policy restricting the LB to Cloudflare (null when disabled)."
  value       = module.load_balancer.security_policy_name
}
