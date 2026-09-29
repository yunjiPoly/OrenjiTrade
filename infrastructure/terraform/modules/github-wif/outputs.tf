output "workload_identity_provider" {
  description = "Value for google-github-actions/auth `workload_identity_provider` (projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "pool_name" {
  description = "Full resource name of the pool."
  value       = google_iam_workload_identity_pool.github.name
}

output "attribute_condition" {
  description = "CEL condition applied to incoming GitHub tokens."
  value       = local.attribute_condition
}
