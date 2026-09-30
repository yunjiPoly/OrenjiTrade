output "network_id" {
  description = "Fully-qualified network id (projects/../global/networks/..)."
  value       = google_compute_network.this.id
}

output "network_name" {
  description = "VPC network name."
  value       = google_compute_network.this.name
}

output "network_self_link" {
  description = "VPC network self link."
  value       = google_compute_network.this.self_link
}

output "connector_id" {
  description = "Serverless VPC Access connector id, to pass to Cloud Run services."
  value       = google_vpc_access_connector.this.id
}

output "connector_subnet_cidr" {
  description = "CIDR of the connector subnet."
  value       = google_compute_subnetwork.connector.ip_cidr_range
}

output "private_service_access_range_name" {
  description = "Name of the reserved PSA range (for Cloud SQL allocated_ip_range)."
  value       = google_compute_global_address.private_service_access.name
}

output "private_service_access_connection" {
  description = "Service Networking connection id; depend on this before creating Cloud SQL / Memorystore."
  value       = google_service_networking_connection.private_service_access.id
}
