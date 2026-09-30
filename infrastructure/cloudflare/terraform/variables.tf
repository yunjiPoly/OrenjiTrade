variable "cloudflare_api_token" {
  description = "Cloudflare API token (null = read from CLOUDFLARE_API_TOKEN). Never commit it."
  type        = string
  default     = null
  sensitive   = true
}

variable "zone_id" {
  description = "Zone id of orenjitrade.com (Cloudflare dashboard > Overview > API)."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.zone_id))
    error_message = "zone_id must be the 32-character hex zone id."
  }
}

variable "zone_name" {
  description = "Zone apex."
  type        = string
  default     = "orenjitrade.com"

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.zone_name))
    error_message = "zone_name must be a domain name."
  }
}

variable "load_balancer_ipv4" {
  description = "Static IPv4 of the production Google Cloud load balancer (terraform output load_balancer_ipv4 in environments/prod)."
  type        = string

  validation {
    condition     = can(cidrnetmask("${var.load_balancer_ipv4}/32"))
    error_message = "load_balancer_ipv4 must be an IPv4 address."
  }
}

variable "load_balancer_ipv6" {
  description = "Optional static IPv6 of the production load balancer (creates AAAA records)."
  type        = string
  default     = null
}

variable "additional_a_records" {
  description = "Extra proxied A records (dev/staging), keyed by record name relative to the zone, e.g. { dev = \"203.0.113.10\", \"dev-api\" = \"203.0.113.10\" }."
  type        = map(string)
  default     = {}
}

variable "email_records" {
  description = <<-EOT
    Transactional-email DNS records (SPF/DKIM/DMARC) keyed by record name relative to the zone.
    Values come from the email provider; the defaults are placeholders that reject all mail
    until a provider is configured.
  EOT
  type = map(object({
    type    = string
    content = string
  }))
  default = {
    "@" = {
      type    = "TXT"
      content = "v=spf1 -all"
    }
    "_dmarc" = {
      type    = "TXT"
      content = "v=DMARC1; p=reject; rua=mailto:dmarc-reports@example.com; adkim=s; aspf=s"
    }
  }

  validation {
    condition     = alltrue([for r in var.email_records : contains(["TXT", "CNAME", "MX"], r.type)])
    error_message = "email_records types must be TXT, CNAME or MX."
  }
}

variable "hsts_max_age" {
  description = "HSTS max-age in seconds (start low, raise to 31536000 once everything is HTTPS)."
  type        = number
  default     = 31536000
}

variable "hsts_preload" {
  description = "Set the HSTS preload directive (only after submitting to hstspreload.org)."
  type        = bool
  default     = false
}

variable "security_level" {
  description = "Cloudflare security level (essentially_off, low, medium, high, under_attack)."
  type        = string
  default     = "medium"

  validation {
    condition     = contains(["essentially_off", "low", "medium", "high", "under_attack"], var.security_level)
    error_message = "security_level must be one of essentially_off, low, medium, high, under_attack."
  }
}

variable "bot_fight_mode" {
  description = "Enable Bot Fight Mode (zone-wide; watch for challenged mobile-app traffic on api.*)."
  type        = bool
  default     = true
}

variable "enable_managed_waf" {
  description = "Deploy the Cloudflare Managed Ruleset + OWASP Core Ruleset (requires Pro plan or higher)."
  type        = bool
  default     = false
}

variable "owasp_paranoia_level" {
  description = "OWASP Core Ruleset paranoia level override (1-4)."
  type        = number
  default     = 1

  validation {
    condition     = var.owasp_paranoia_level >= 1 && var.owasp_paranoia_level <= 4
    error_message = "owasp_paranoia_level must be 1-4."
  }
}

variable "rate_limit_requests_per_10s" {
  description = "Requests allowed per client IP per 10 seconds for each protected group."
  type = object({
    auth      = optional(number, 20)
    messaging = optional(number, 20)
    search    = optional(number, 60)
  })
  default = {}
}

variable "static_asset_extensions" {
  description = "File extensions cached at the edge for the web host (respecting origin Cache-Control)."
  type        = list(string)
  default     = ["js", "css", "woff", "woff2", "ttf", "png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "ico", "webmanifest"]
}
