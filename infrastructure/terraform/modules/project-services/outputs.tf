output "enabled_services" {
  description = "Set of API names enabled by this module."
  value       = [for s in google_project_service.this : s.service]
}

output "project_id" {
  description = "Project id the APIs were enabled in (handy for depends_on chaining)."
  value       = var.project_id
}
