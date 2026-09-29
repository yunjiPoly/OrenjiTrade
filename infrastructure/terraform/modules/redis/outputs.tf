output "host" {
  description = "Private IP of the Redis endpoint."
  value       = google_redis_instance.this.host
}

output "port" {
  description = "Redis port."
  value       = google_redis_instance.this.port
}

output "auth_string" {
  description = "AUTH password (sensitive). The environment stores it in Secret Manager as part of REDIS_URL."
  value       = google_redis_instance.this.auth_string
  sensitive   = true
}

output "redis_url" {
  description = "redis:// URL including AUTH (sensitive)."
  value       = "${var.transit_encryption_mode == "SERVER_AUTHENTICATION" ? "rediss" : "redis"}://:${google_redis_instance.this.auth_string}@${google_redis_instance.this.host}:${google_redis_instance.this.port}"
  sensitive   = true
}

output "instance_id" {
  description = "Instance id (projects/../locations/../instances/..)."
  value       = google_redis_instance.this.id
}

output "instance_name" {
  description = "Instance name."
  value       = google_redis_instance.this.name
}
