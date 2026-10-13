# Cloudflare zone configuration for orenjitrade.com (the zone already exists in the owner's
# account; this only manages records, settings and rules inside it). The narrative version
# with dashboard steps is ../README.md. Everything here fits the Free plan (ADR 0016): one
# rate-limiting rule, <= 5 custom WAF rules, <= 10 cache rules, no managed rulesets.

locals {
  www_host = "www.${var.zone_name}"
  api_host = "api.${var.zone_name}"

  static_ext_set = "{${join(" ", [for e in var.static_asset_extensions : "\"${e}\""])}}"

  # Public, immutable image responses of the API that Cloudflare may cache (the API sends
  # `Cache-Control: public, max-age=31536000, immutable` for cached artworks and media,
  # `public, max-age=300` for placeholders); every other API response carries no-store.
  public_image_paths_expr = join(" or ", [for p in var.cacheable_api_path_prefixes : "starts_with(http.request.uri.path, \"${p}\")"])
  rate_limit_paths_expr   = join(" or ", [for p in var.rate_limit_path_prefixes : "starts_with(http.request.uri.path, \"${p}\")"])
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

# Certificate Manager DNS authorization (output `certificate_dns_authorizations` of each
# Google Cloud environment): `_acme-challenge.<host>` CNAMEs that Google checks to issue the
# origin certificate. They MUST stay DNS only (not proxied): a proxied CNAME is flattened to
# Cloudflare edge addresses and the challenge never validates.
resource "cloudflare_dns_record" "certificate_dns_authorization" {
  for_each = var.certificate_dns_authorizations

  zone_id = var.zone_id
  name    = trimsuffix(each.value.name, ".")
  type    = each.value.type
  content = trimsuffix(each.value.data, ".")
  proxied = false
  ttl     = 300
  comment = "Certificate Manager DNS authorization for ${each.key} (managed by Terraform; never proxy)"
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
    ssl                      = "strict" # Full (strict): validates the origin certificate (Certificate Manager public CA or Cloudflare Origin CA)
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
# Cache rules (Free plan: up to 10). Expressions are mutually exclusive so the outcome does
# not depend on rule order. Cloudflare never caches responses with Cache-Control no-store /
# private, and the API's authenticated and error responses carry
# `no-cache, no-store, max-age=0, must-revalidate` (Spring Security defaults +
# ProblemDetailFactory), so only the explicitly public image routes are cache-eligible.
# ---------------------------------------------------------------------------------------

resource "cloudflare_ruleset" "cache" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade cache rules"
  description = "Cache public card images / media on api.* and hashed assets on www; bypass everything else"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      ref         = "public_images_api"
      description = "Cache the API's public image routes (card images, placeholders, media) honouring origin Cache-Control"
      expression  = "(http.host eq \"${local.api_host}\") and (${local.public_image_paths_expr})"
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
      ref         = "bypass_api"
      description = "Bypass cache for every other request to ${local.api_host} (authenticated JSON, WebSocket, webhooks)"
      expression  = "(http.host eq \"${local.api_host}\") and not (${local.public_image_paths_expr})"
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
      description = "Never cache the SPA shell / config.json on ${local.www_host} (index.html must reflect every deploy)"
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
# Rate limiting. Free plan (Cloudflare docs, rate-limiting rules availability): ONE rule per
# zone, counting period and mitigation timeout fixed at 10 s, characteristics IP (+ the
# mandatory data-center id), request fields limited to path and verified bot. The former
# auth / messaging / search rules are therefore merged into one path-based flood guard; the
# fine-grained per-user and per-route limits are the API's Redis fixed windows
# (apps/api application.yml orenji.ratelimit).
# ---------------------------------------------------------------------------------------

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade rate limits"
  description = "Edge flood guard in front of the API's own Redis fixed windows (Free plan: a single rule)"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      ref         = "ratelimit_api"
      description = "Auth/session, messaging, community, search, regions and card endpoints: ${var.rate_limit_requests_per_10s} requests per 10 s per IP"
      expression  = "(${local.rate_limit_paths_expr})"
      action      = "block"
      enabled     = true
      ratelimit = {
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 10
        requests_per_period = var.rate_limit_requests_per_10s
        mitigation_timeout  = 10
      }
    },
  ]
}

# ---------------------------------------------------------------------------------------
# WAF: custom rules (all plans, 5 on Free) + managed rulesets (Pro and above)
# ---------------------------------------------------------------------------------------

resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.zone_id
  name        = "OrenjiTrade custom WAF rules"
  description = "Block operational endpoints from the public internet"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = concat(
    [
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
    ],
    # Cloud Scheduler and Pub/Sub reach /internal/** over the Cloud Run URL (internal ingress),
    # so the edge can block the prefix outright. Off by default because the operator scripts
    # (npm run catalog:import, card-images:status|reconcile) still go through the public
    # hostname with the service token; turn it on once those run from inside the project.
    var.block_internal_paths_at_edge ? [
      {
        ref         = "block_internal"
        description = "/internal/** is served to Cloud Scheduler / Pub/Sub over the Cloud Run URL, never through the edge"
        expression  = "(http.host eq \"${local.api_host}\") and starts_with(http.request.uri.path, \"/internal/\")"
        action      = "block"
        enabled     = true
      },
    ] : []
  )
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
