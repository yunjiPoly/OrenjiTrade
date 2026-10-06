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

output "direct_vpc_subnet_name" {
  description = "Name of the Direct VPC egress subnet (null when direct_vpc_subnet_cidr is unset); pass to cloud-run-service vpc_subnetwork."
  value       = var.direct_vpc_subnet_cidr == null ? null : google_compute_subnetwork.direct_vpc[0].name
}

output "direct_vpc_subnet_id" {
  description = "Id of the Direct VPC egress subnet (null when unset)."
  value       = var.direct_vpc_subnet_cidr == null ? null : google_compute_subnetwork.direct_vpc[0].id
}

output "direct_vpc_subnet_cidr" {
  description = "CIDR of the Direct VPC egress subnet (null when unset)."
  value       = var.direct_vpc_subnet_cidr
}

output "connector_id" {
  description = "Serverless VPC Access connector id to pass to Cloud Run services (null when enable_connector is false)."
  value       = var.enable_connector ? google_vpc_access_connector.this[0].id : null
}

output "connector_subnet_cidr" {
  description = "CIDR of the connector subnet (null when enable_connector is false)."
  value       = var.enable_connector ? google_compute_subnetwork.connector[0].ip_cidr_range : null
}

output "private_service_access_range_name" {
  description = "Name of the reserved PSA range (for Cloud SQL allocated_ip_range)."
  value       = google_compute_global_address.private_service_access.name
}

output "private_service_access_connection" {
  description = "Service Networking connection id; depend on this before creating Cloud SQL / Memorystore."
  value       = google_service_networking_connection.private_service_access.id
}
