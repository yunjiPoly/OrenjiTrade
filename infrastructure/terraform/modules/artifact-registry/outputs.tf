output "repository_id" {
  description = "Repository id."
  value       = google_artifact_registry_repository.docker.repository_id
}

output "repository_name" {
  description = "Full resource name of the repository."
  value       = google_artifact_registry_repository.docker.name
}

output "registry_host" {
  description = "Docker registry host, e.g. northamerica-northeast1-docker.pkg.dev."
  value       = "${var.region}-docker.pkg.dev"
}

output "repository_url" {
  description = "Image prefix: <region>-docker.pkg.dev/<project>/<repo>."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}
