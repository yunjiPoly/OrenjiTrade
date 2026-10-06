variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Region of the Cloud Run services (serverless NEGs are regional)."
  type        = string
  default     = "northamerica-northeast1"
}

variable "name" {
  description = "Prefix for every LB resource, e.g. orenjitrade-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]{0,40}[a-z0-9])?$", var.name))
    error_message = "name must be a short GCE resource name."
  }
}

variable "backends" {
  description = <<-EOT
    Backends keyed by short name (api, web). `hosts` are the public hostnames routed to that
    backend; `timeout_sec` bounds a single request/WebSocket connection.
  EOT
  type = map(object({
    cloud_run_service_name = string
    hosts                  = list(string)
    timeout_sec            = optional(number, 60)
    log_sample_rate        = optional(number, 1)
  }))

  validation {
    condition     = alltrue([for b in var.backends : length(b.hosts) > 0])
    error_message = "Every backend needs at least one host."
  }

  validation {
    condition     = alltrue([for b in var.backends : b.timeout_sec >= 1 && b.timeout_sec <= 86400])
    error_message = "timeout_sec must be between 1 and 86400."
  }
}

variable "default_backend" {
  description = "Backend key that serves hosts not matched by any host rule."
  type        = string
  default     = "web"
}

variable "certificate_mode" {
  description = "certificate_manager (Google-managed, DNS authorization; works behind the Cloudflare proxy), compute_managed (classic HTTP-validated managed certificate; hostnames must resolve directly to the LB) or self_managed (PEM supplied through self_managed_certificate, e.g. a Cloudflare Origin CA certificate)."
  type        = string
  default     = "certificate_manager"

  validation {
    condition     = contains(["certificate_manager", "compute_managed", "self_managed"], var.certificate_mode)
    error_message = "certificate_mode must be certificate_manager, compute_managed or self_managed."
  }
}

variable "self_managed_certificate" {
  description = "PEM certificate chain + private key for certificate_mode = self_managed. Supply them through a git-ignored tfvars file or from Secret Manager data sources in the environment; never commit them."
  type = object({
    certificate_pem = string
    private_key_pem = string
  })
  default   = null
  sensitive = true

  validation {
    condition     = var.certificate_mode != "self_managed" || var.self_managed_certificate != null
    error_message = "self_managed_certificate is required when certificate_mode is self_managed."
  }
}

variable "enable_ipv6" {
  description = "Also reserve an IPv6 address and forwarding rules (Cloudflare can then use AAAA origins)."
  type        = bool
  default     = false
}

variable "restrict_to_cloudflare" {
  description = "Attach a Cloud Armor policy that only allows Cloudflare's edge IP ranges."
  type        = bool
  default     = false
}

variable "extra_allowed_ranges" {
  description = "Additional CIDR ranges admitted by the Cloud Armor policy (max 10)."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.extra_allowed_ranges) <= 10
    error_message = "extra_allowed_ranges supports at most 10 ranges."
  }
}

variable "labels" {
  description = "Labels applied to Certificate Manager resources."
  type        = map(string)
  default     = {}
}

# Source of truth: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
# Re-check quarterly; the Cloudflare README has the refresh procedure.
variable "cloudflare_ipv4_ranges" {
  description = "Cloudflare IPv4 edge ranges."
  type        = list(string)
  default = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
  ]

  validation {
    condition     = alltrue([for r in var.cloudflare_ipv4_ranges : can(cidrnetmask(r))])
    error_message = "cloudflare_ipv4_ranges must be valid IPv4 CIDR blocks."
  }
}

variable "cloudflare_ipv6_ranges" {
  description = "Cloudflare IPv6 edge ranges."
  type        = list(string)
  default = [
    "2400:cb00::/32",
    "2606:4700::/32",
    "2803:f800::/32",
    "2405:b500::/32",
    "2405:8100::/32",
    "2a06:98c0::/29",
    "2c0f:f248::/32",
  ]

  validation {
    condition     = alltrue([for r in var.cloudflare_ipv6_ranges : can(cidrhost(r, 0))])
    error_message = "cloudflare_ipv6_ranges must be valid IPv6 CIDR blocks."
  }
}
