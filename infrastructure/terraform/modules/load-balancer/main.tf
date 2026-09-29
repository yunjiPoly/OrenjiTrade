# Global external Application Load Balancer in front of Cloud Run (serverless NEGs):
#   * one static IPv4 (optional IPv6) address for Cloudflare to point at
#   * Google-managed certificate covering the web and api hostnames
#   * host-based routing: api host -> api backend, everything else -> web backend
#   * HTTP -> HTTPS 301 redirect
#   * optional Cloud Armor policy that only admits Cloudflare edge IP ranges, so nobody can
#     bypass Cloudflare (WAF, rate limits, bot protection) by hitting the LB IP directly
#   * long backend timeout for the api so WebSocket sessions survive

locals {
  cloudflare_ipv4_chunks = chunklist(var.cloudflare_ipv4_ranges, 10)
  cloudflare_ipv6_chunks = chunklist(var.cloudflare_ipv6_ranges, 10)
}

resource "google_compute_global_address" "ipv4" {
  project      = var.project_id
  name         = "${var.name}-ipv4"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

resource "google_compute_global_address" "ipv6" {
  count = var.enable_ipv6 ? 1 : 0

  project      = var.project_id
  name         = "${var.name}-ipv6"
  address_type = "EXTERNAL"
  ip_version   = "IPV6"
}

# ---------------------------------------------------------------------------------------
# Cloud Armor (optional)
# ---------------------------------------------------------------------------------------

resource "google_compute_security_policy" "cloudflare_only" {
  count = var.restrict_to_cloudflare ? 1 : 0

  project     = var.project_id
  name        = "${var.name}-cloudflare-only"
  description = "Admit only Cloudflare edge ranges; everything else is denied."
  type        = "CLOUD_ARMOR"

  dynamic "rule" {
    for_each = { for i, chunk in local.cloudflare_ipv4_chunks : i => chunk }
    content {
      action      = "allow"
      priority    = 1000 + rule.key
      description = "Cloudflare IPv4 ranges (${rule.key + 1}/${length(local.cloudflare_ipv4_chunks)})"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = rule.value
        }
      }
    }
  }

  dynamic "rule" {
    for_each = { for i, chunk in local.cloudflare_ipv6_chunks : i => chunk }
    content {
      action      = "allow"
      priority    = 2000 + rule.key
      description = "Cloudflare IPv6 ranges (${rule.key + 1}/${length(local.cloudflare_ipv6_chunks)})"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = rule.value
        }
      }
    }
  }

  dynamic "rule" {
    for_each = length(var.extra_allowed_ranges) > 0 ? [1] : []
    content {
      action      = "allow"
      priority    = 3000
      description = "Operator-defined allow list (uptime checkers, office egress)"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.extra_allowed_ranges
        }
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 2147483647
    description = "Default deny"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }
}

# ---------------------------------------------------------------------------------------
# Backends
# ---------------------------------------------------------------------------------------

resource "google_compute_region_network_endpoint_group" "this" {
  for_each = var.backends

  project               = var.project_id
  name                  = "${var.name}-${each.key}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.cloud_run_service_name
  }
}

resource "google_compute_backend_service" "this" {
  for_each = var.backends

  project               = var.project_id
  name                  = "${var.name}-${each.key}"
  description           = "Serverless NEG backend for ${each.value.cloud_run_service_name}"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  timeout_sec           = each.value.timeout_sec
  enable_cdn            = false
  security_policy       = var.restrict_to_cloudflare ? google_compute_security_policy.cloudflare_only[0].id : null

  backend {
    group = google_compute_region_network_endpoint_group.this[each.key].id
  }

  log_config {
    enable      = true
    sample_rate = each.value.log_sample_rate
  }
}

# ---------------------------------------------------------------------------------------
# Routing, certificates, proxies
# ---------------------------------------------------------------------------------------

resource "google_compute_url_map" "https" {
  project         = var.project_id
  name            = "${var.name}-https"
  default_service = google_compute_backend_service.this[var.default_backend].id

  dynamic "host_rule" {
    for_each = var.backends
    content {
      hosts        = host_rule.value.hosts
      path_matcher = host_rule.key
    }
  }

  dynamic "path_matcher" {
    for_each = var.backends
    content {
      name            = path_matcher.key
      default_service = google_compute_backend_service.this[path_matcher.key].id
    }
  }
}

resource "google_compute_managed_ssl_certificate" "this" {
  project = var.project_id
  name    = "${var.name}-cert-${substr(md5(join(",", sort(local.all_hosts))), 0, 8)}"

  managed {
    domains = local.all_hosts
  }

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  all_hosts = distinct(flatten([for b in var.backends : b.hosts]))
}

resource "google_compute_ssl_policy" "modern" {
  project         = var.project_id
  name            = "${var.name}-tls12-modern"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_compute_target_https_proxy" "this" {
  project          = var.project_id
  name             = "${var.name}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.this.id]
  ssl_policy       = google_compute_ssl_policy.modern.id
  quic_override    = "ENABLE"
}

resource "google_compute_global_forwarding_rule" "https_ipv4" {
  project               = var.project_id
  name                  = "${var.name}-https-ipv4"
  target                = google_compute_target_https_proxy.this.id
  ip_address            = google_compute_global_address.ipv4.address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_global_forwarding_rule" "https_ipv6" {
  count = var.enable_ipv6 ? 1 : 0

  project               = var.project_id
  name                  = "${var.name}-https-ipv6"
  target                = google_compute_target_https_proxy.this.id
  ip_address            = google_compute_global_address.ipv6[0].address
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# HTTP -> HTTPS redirect (Cloudflare also enforces HTTPS; this covers direct hits).
resource "google_compute_url_map" "http_redirect" {
  project = var.project_id
  name    = "${var.name}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  project = var.project_id
  name    = "${var.name}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_ipv4" {
  project               = var.project_id
  name                  = "${var.name}-http-ipv4"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.ipv4.address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

resource "google_compute_global_forwarding_rule" "http_ipv6" {
  count = var.enable_ipv6 ? 1 : 0

  project               = var.project_id
  name                  = "${var.name}-http-ipv6"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.ipv6[0].address
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
