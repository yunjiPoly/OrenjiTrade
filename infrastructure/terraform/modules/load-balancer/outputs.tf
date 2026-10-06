output "ipv4_address" {
  description = "Static IPv4 address of the load balancer (Cloudflare A records point here)."
  value       = google_compute_global_address.ipv4.address
}

output "ipv6_address" {
  description = "Static IPv6 address (null unless enable_ipv6)."
  value       = var.enable_ipv6 ? google_compute_global_address.ipv6[0].address : null
}

output "certificate_mode" {
  description = "Certificate mode in use."
  value       = var.certificate_mode
}

output "certificate_name" {
  description = "Name of the certificate resource (Certificate Manager certificate, classic managed certificate or self-managed certificate depending on the mode)."
  value = (
    local.certificate_manager ? google_certificate_manager_certificate.this[0].name :
    (local.compute_managed ? google_compute_managed_ssl_certificate.this[0].name : google_compute_ssl_certificate.self_managed[0].name)
  )
}

output "certificate_domains" {
  description = "Hostnames on the certificate."
  value       = local.all_hosts
}

output "certificate_map_name" {
  description = "Certificate Manager map name (null unless certificate_mode is certificate_manager)."
  value       = local.certificate_manager ? google_certificate_manager_certificate_map.this[0].name : null
}

output "dns_authorization_records" {
  description = "DNS records to create (unproxied) for Certificate Manager DNS authorization: host => { name, type, data }. Feed into infrastructure/cloudflare/terraform `certificate_dns_authorizations`."
  value = {
    for h, auth in google_certificate_manager_dns_authorization.this : h => {
      name = auth.dns_resource_record[0].name
      type = auth.dns_resource_record[0].type
      data = auth.dns_resource_record[0].data
    }
  }
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
