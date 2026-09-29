# Cloudflare zone configuration for orenjitrade.com (the zone already exists in the owner's
# account; this only manages records, settings and rules inside it). The narrative version
# with dashboard steps is ../README.md.

locals {
  www_host = "www.${var.zone_name}"
  api_host = "api.${var.zone_name}"

  static_ext_set = "{${join(" ", [for e in var.static_asset_extensions : "\"${e}\""])}}"
}

# ---------------------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------------------

resource "cloudflare_dns_record" "www" {
  zone_id = var.zone_id
  name    = local.www_host
  type    = "A"
  content = var.load_balancer_ipv4
  proxied = true
  ttl     = 1 # automatic (required when proxied)
  comment = "Web app -> Google Cloud external HTTPS LB (managed by Terraform)"
}

resource "cloudflare_dns_record" "api" {
  zone_id = var.zone_id
  name    = local.api_host
  type    = "A"
  content = var.load_balancer_ipv4
  proxied = true
  ttl     = 1
  comment = "API + WebSocket -> Google Cloud external HTTPS LB (managed by Terraform)"
}

# The apex only exists so the redirect rule can execute at the edge; 192.0.2.1 is TEST-NET-1
# and never receives traffic because the record is proxied and redirected.
resource "cloudflare_dns_record" "apex" {
  zone_id = var.zone_id
  name    = var.zone_name
  type    = "A"
  content = "192.0.2.1"
  proxied = true
  ttl     = 1
  comment = "Placeholder origin; 301 redirect to www is a redirect rule"
}

resource "cloudflare_dns_record" "www_ipv6" {
  count = var.load_balancer_ipv6 == null ? 0 : 1

  zone_id = var.zone_id
  name    = local.www_host
  type    = "AAAA"
  content = var.load_balancer_ipv6
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "api_ipv6" {
  count = var.load_balancer_ipv6 == null ? 0 : 1

  zone_id = var.zone_id
  name    = local.api_host
  type    = "AAAA"
  content = var.load_balancer_ipv6
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "additional" {
  for_each = var.additional_a_records

  zone_id = var.zone_id
  name    = "${each.key}.${var.zone_name}"
  type    = "A"
  content = each.value
  proxied = true
  ttl     = 1
  comment = "Non-production environment (managed by Terraform)"
}

resource "cloudflare_dns_record" "email" {
  for_each = var.email_records

  zone_id = var.zone_id
  name    = each.key == "@" ? var.zone_name : "${each.key}.${var.zone_name}"
  type    = each.value.type
  content = each.value.content
  proxied = false
  ttl     = 3600
  comment = "Transactional email authentication (managed by Terraform)"
}

# ---------------------------------------------------------------------------------------
# Zone settings: TLS, HSTS, protocol features
# ---------------------------------------------------------------------------------------

locals {
  zone_settings = {
    ssl                      = "strict" # Full (strict): validate the Google-managed origin certificate
    always_use_https         = "on"
    min_tls_version          = "1.2"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
    opportunistic_encryption = "on"
    websockets               = "on" # STOMP over WebSocket on api.*
    http3                    = "on"
    brotli                   = "on"
    ipv6                     = "on"
    browser_check            = "on"
    security_level           = var.security_level
    always_online            = "off" # never serve stale app shells
    "0rtt"                   = "off" # 0-RTT replays are unsafe for a stateful API
    email_obfuscation        = "off" # breaks JSON responses containing addresses
    rocket_loader            = "off" # incompatible with Angular bootstrapping
    mirage                   = "off"
    polish                   = "off" # images are re-encoded by the API already
  }
}

resource "cloudflare_zone_setting" "this" {
  for_each = local.zone_settings

  zone_id    = var.zone_id
  setting_id = each.key
  value      = each.value
}

resource "cloudflare_zone_setting" "hsts" {
  zone_id    = var.zone_id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = var.hsts_max_age
      include_subdomains = true
      preload            = var.hsts_preload
      nosniff            = true
    }
  }
}

resource "cloudflare_bot_management" "this" {
  zone_id    = var.zone_id
  fight_mode = var.bot_fight_mode
}

# ---------------------------------------------------------------------------------------
# Redirects: apex -> www (301, keep path + query)
# ---------------------------------------------------------------------------------------

resource "cloudflare_ruleset" "redirects" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade redirects"
  description = "Canonical host redirects"
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [
    {
      ref         = "apex_to_www"
      description = "301 ${var.zone_name} -> https://${local.www_host} preserving path and query"
      expression  = "(http.host eq \"${var.zone_name}\")"
      action      = "redirect"
      enabled     = true
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://${local.www_host}\", http.request.uri.path)"
          }
        }
      }
    },
  ]
}

# ---------------------------------------------------------------------------------------
# Cache rules
# ---------------------------------------------------------------------------------------

resource "cloudflare_ruleset" "cache" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade cache rules"
  description = "Never cache the API or authenticated requests; cache hashed static assets on www"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      ref         = "bypass_api"
      description = "Bypass cache entirely for ${local.api_host}"
      expression  = "(http.host eq \"${local.api_host}\")"
      action      = "set_cache_settings"
      enabled     = true
      action_parameters = {
        cache = false
      }
    },
    {
      ref         = "bypass_authenticated"
      description = "Bypass cache for any request carrying Authorization or Cookie headers"
      expression  = "(any(http.request.headers.names[*] == \"authorization\")) or (http.cookie ne \"\")"
      action      = "set_cache_settings"
      enabled     = true
      action_parameters = {
        cache = false
      }
    },
    {
      ref         = "static_assets_www"
      description = "Cache fingerprinted static assets on ${local.www_host}, honouring origin Cache-Control"
      expression  = "(http.host eq \"${local.www_host}\") and (http.request.uri.path.extension in ${local.static_ext_set})"
      action      = "set_cache_settings"
      enabled     = true
      action_parameters = {
        cache = true
        edge_ttl = {
          mode = "respect_origin"
        }
        browser_ttl = {
          mode = "respect_origin"
        }
        cache_key = {
          ignore_query_strings_order = true
          cache_deception_armor      = true
        }
      }
    },
    {
      ref         = "bypass_app_shell"
      description = "Never cache the SPA shell / API docs on ${local.www_host} (index.html must reflect every deploy)"
      expression  = "(http.host eq \"${local.www_host}\") and not (http.request.uri.path.extension in ${local.static_ext_set})"
      action      = "set_cache_settings"
      enabled     = true
      action_parameters = {
        cache = false
      }
    },
  ]
}

# ---------------------------------------------------------------------------------------
# Rate limiting (available on every plan with ip.src + cf.colo.id characteristics, 10 s period)
# ---------------------------------------------------------------------------------------

locals {
  rate_limit_rules = {
    auth = {
      description         = "Auth/session endpoints"
      expression          = "(http.host eq \"${local.api_host}\") and (starts_with(http.request.uri.path, \"/api/v1/auth\") or http.request.uri.path eq \"/api/v1/me\")"
      requests_per_period = var.rate_limit_requests_per_10s.auth
    }
    messaging = {
      description         = "Sending messages / creating conversations"
      expression          = "(http.host eq \"${local.api_host}\") and (http.request.method eq \"POST\") and (starts_with(http.request.uri.path, \"/api/v1/conversations\") or starts_with(http.request.uri.path, \"/api/v1/community\"))"
      requests_per_period = var.rate_limit_requests_per_10s.messaging
    }
    search = {
      description         = "Search and nearby-collector queries"
      expression          = "(http.host eq \"${local.api_host}\") and (starts_with(http.request.uri.path, \"/api/v1/search\") or starts_with(http.request.uri.path, \"/api/v1/collectors/nearby\") or starts_with(http.request.uri.path, \"/api/v1/cards\"))"
      requests_per_period = var.rate_limit_requests_per_10s.search
    }
  }
}

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade rate limits"
  description = "Edge rate limits in front of the API's own Redis token buckets"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    for key, rule in local.rate_limit_rules : {
      ref         = "ratelimit_${key}"
      description = rule.description
      expression  = rule.expression
      action      = "block"
      enabled     = true
      ratelimit = {
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 10
        requests_per_period = rule.requests_per_period
        mitigation_timeout  = 10
      }
    }
  ]
}

# ---------------------------------------------------------------------------------------
# WAF: custom rules (all plans) + managed rulesets (Pro and above)
# ---------------------------------------------------------------------------------------

resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade custom WAF rules"
  description = "Block operational endpoints from the public internet"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [
    {
      ref         = "block_actuator"
      description = "Only the health endpoints of Spring Actuator are reachable"
      expression  = "(http.host eq \"${local.api_host}\") and starts_with(http.request.uri.path, \"/actuator/\") and not starts_with(http.request.uri.path, \"/actuator/health\")"
      action      = "block"
      enabled     = true
    },
    {
      ref         = "block_api_docs"
      description = "Swagger UI / OpenAPI documents are local-profile only"
      expression  = "(http.host eq \"${local.api_host}\") and (starts_with(http.request.uri.path, \"/swagger-ui\") or starts_with(http.request.uri.path, \"/v3/api-docs\"))"
      action      = "block"
      enabled     = true
    },
  ]
}

resource "cloudflare_ruleset" "waf_managed" {
  count = var.enable_managed_waf ? 1 : 0

  zone_id     = var.zone_id
  name        = "OrenjiTrade managed WAF"
  description = "Cloudflare Managed Ruleset + OWASP Core Ruleset"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [
    {
      ref         = "cloudflare_managed"
      description = "Cloudflare Managed Ruleset"
      expression  = "true"
      action      = "execute"
      enabled     = true
      action_parameters = {
        id = "efb7b8c949ac4650a09736fc376e9aee"
      }
    },
    {
      ref         = "owasp_core"
      description = "OWASP Core Ruleset (paranoia level ${var.owasp_paranoia_level}, anomaly threshold medium)"
      expression  = "true"
      action      = "execute"
      enabled     = true
      action_parameters = {
        id = "4814384a9e5d4991b9815dcfc25d2f1f"
        overrides = {
          categories = [
            {
              category = "paranoia-level-${var.owasp_paranoia_level + 1}"
              enabled  = false
            },
          ]
        }
      }
    },
  ]
}
