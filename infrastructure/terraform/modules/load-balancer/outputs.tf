output "ipv4_address" {
  description = "Static IPv4 address of the load balancer (Cloudflare A records point here)."
  value       = google_compute_global_address.ipv4.address
}

output "ipv6_address" {
  description = "Static IPv6 address (null unless enable_ipv6)."
  value       = var.enable_ipv6 ? google_compute_global_address.ipv6[0].address : null
}

output "certificate_name" {
  description = "Google-managed certificate name (check provisioning with gcloud compute ssl-certificates describe)."
  value       = google_compute_managed_ssl_certificate.this.name
}

output "certificate_domains" {
  description = "Hostnames on the managed certificate."
  value       = local.all_hosts
}

output "backend_service_ids" {
  description = "Map backend key => backend service id."
  value       = { for k, b in google_compute_backend_service.this : k => b.id }
}

output "url_map_name" {
  description = "HTTPS URL map name (resource.label.url_map_name in LB metrics)."
  value       = google_compute_url_map.https.name
}

output "security_policy_name" {
  description = "Cloud Armor policy name (null when restrict_to_cloudflare is false)."
  value       = var.restrict_to_cloudflare ? google_compute_security_policy.cloudflare_only[0].name : null
}
