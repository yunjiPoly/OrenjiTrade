output "name" {
  description = "Service name."
  value       = google_cloud_run_v2_service.this.name
}

output "id" {
  description = "Service id."
  value       = google_cloud_run_v2_service.this.id
}

output "uri" {
  description = "Default *.run.app URL."
  value       = google_cloud_run_v2_service.this.uri
}

output "location" {
  description = "Region."
  value       = google_cloud_run_v2_service.this.location
}

output "latest_ready_revision" {
  description = "Latest ready revision name (as of the last apply)."
  value       = google_cloud_run_v2_service.this.latest_ready_revision
}

output "container_name" {
  description = "Name of the main container (deploy.yml targets it with --container)."
  value       = local.container_name
}

output "sidecar_names" {
  description = "Names of the sidecar containers."
  value       = local.sidecar_names
}
