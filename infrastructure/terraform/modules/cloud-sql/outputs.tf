output "instance_name" {
  description = "Cloud SQL instance name."
  value       = google_sql_database_instance.this.name
}

output "connection_name" {
  description = "project:region:instance, used by the Cloud SQL connector and gcloud."
  value       = google_sql_database_instance.this.connection_name
}

output "private_ip_address" {
  description = "Private IP address of the primary instance."
  value       = google_sql_database_instance.this.private_ip_address
}

output "database_name" {
  description = "Application database name."
  value       = google_sql_database.this.name
}

output "app_user_name" {
  description = "Application database user name."
  value       = google_sql_user.app.name
}

output "jdbc_url" {
  description = "JDBC URL over the private IP (TLS required by the instance)."
  value       = "jdbc:postgresql://${google_sql_database_instance.this.private_ip_address}:5432/${google_sql_database.this.name}?sslmode=require"
}

output "database_id" {
  description = "project:instance, the resource label used by Cloud Monitoring."
  value       = "${var.project_id}:${google_sql_database_instance.this.name}"
}
