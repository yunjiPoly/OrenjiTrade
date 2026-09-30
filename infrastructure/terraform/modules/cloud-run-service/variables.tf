variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Cloud Run region."
  type        = string
  default     = "northamerica-northeast1"
}

variable "name" {
  description = "Service name, e.g. orenjitrade-api-dev."
  type        = string

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]{0,47}[a-z0-9])?$", var.name))
    error_message = "name must be a valid Cloud Run service name (lowercase, digits, hyphens, <= 49 chars)."
  }
}

variable "description" {
  description = "Free-text description."
  type        = string
  default     = ""
}

variable "image" {
  description = "Initial container image. Ignored after creation; CI deploys new images."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "service_account_email" {
  description = "Runtime service account email."
  type        = string
}

variable "ingress" {
  description = "INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY or INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER."
  type        = string
  default     = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  validation {
    condition     = contains(["INGRESS_TRAFFIC_ALL", "INGRESS_TRAFFIC_INTERNAL_ONLY", "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"], var.ingress)
    error_message = "ingress must be one of INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER."
  }
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU limit (e.g. \"1\", \"2\")."
  type        = string
  default     = "1"

  validation {
    condition     = contains(["0.08", "0.5", "1", "2", "4", "6", "8"], var.cpu)
    error_message = "cpu must be one of 0.08, 0.5, 1, 2, 4, 6, 8."
  }
}

variable "memory" {
  description = "Memory limit (e.g. \"512Mi\", \"1Gi\")."
  type        = string
  default     = "512Mi"

  validation {
    condition     = can(regex("^[0-9]+(Mi|Gi)$", var.memory))
    error_message = "memory must look like 512Mi or 2Gi."
  }
}

variable "cpu_idle" {
  description = "true = CPU only allocated during requests (request-based billing); false = always allocated (needed for background work / WebSockets)."
  type        = bool
  default     = true
}

variable "startup_cpu_boost" {
  description = "Give extra CPU during startup (JVM cold starts)."
  type        = bool
  default     = true
}

variable "min_instances" {
  description = "Minimum instances (0 = scale to zero)."
  type        = number
  default     = 0

  validation {
    condition     = var.min_instances >= 0
    error_message = "min_instances must be >= 0."
  }
}

variable "max_instances" {
  description = "Maximum instances."
  type        = number
  default     = 3

  validation {
    condition     = var.max_instances >= 1
    error_message = "max_instances must be >= 1."
  }
}

variable "concurrency" {
  description = "Max concurrent requests per instance."
  type        = number
  default     = 80

  validation {
    condition     = var.concurrency >= 1 && var.concurrency <= 1000
    error_message = "concurrency must be between 1 and 1000."
  }
}

variable "request_timeout_seconds" {
  description = "Request timeout (max 3600). WebSocket sessions are bounded by this."
  type        = number
  default     = 300

  validation {
    condition     = var.request_timeout_seconds >= 1 && var.request_timeout_seconds <= 3600
    error_message = "request_timeout_seconds must be between 1 and 3600."
  }
}

variable "session_affinity" {
  description = "Route a client to the same instance when possible (WebSockets)."
  type        = bool
  default     = false
}

variable "vpc_connector_id" {
  description = "Serverless VPC Access connector id (null = no VPC access)."
  type        = string
  default     = null
}

variable "vpc_egress" {
  description = "PRIVATE_RANGES_ONLY or ALL_TRAFFIC (required to reach internal-ingress Cloud Run services)."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"

  validation {
    condition     = contains(["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], var.vpc_egress)
    error_message = "vpc_egress must be PRIVATE_RANGES_ONLY or ALL_TRAFFIC."
  }
}

variable "env" {
  description = "Plain environment variables."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Environment variables sourced from Secret Manager: name => { secret = <secret id>, version = \"latest\" }."
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "startup_probe" {
  description = "HTTP startup probe."
  type = object({
    path                  = string
    initial_delay_seconds = optional(number, 0)
    period_seconds        = optional(number, 5)
    timeout_seconds       = optional(number, 3)
    failure_threshold     = optional(number, 24)
  })
  default = {
    path = "/"
  }
}

variable "liveness_probe" {
  description = "HTTP liveness probe (null to disable)."
  type = object({
    path                  = string
    initial_delay_seconds = optional(number, 0)
    period_seconds        = optional(number, 30)
    timeout_seconds       = optional(number, 3)
    failure_threshold     = optional(number, 3)
  })
  default = null
}

variable "allow_unauthenticated" {
  description = "Grant roles/run.invoker to allUsers (required behind the external load balancer)."
  type        = bool
  default     = false
}

variable "invoker_members" {
  description = "IAM members granted roles/run.invoker (scheduler SA, Pub/Sub push SA, calling services)."
  type        = list(string)
  default     = []
}

variable "custom_audiences" {
  description = "Extra OIDC audiences accepted by Cloud Run IAM (e.g. https://api.orenjitrade.com)."
  type        = list(string)
  default     = []
}

variable "deletion_protection" {
  description = "Refuse to delete the service from Terraform."
  type        = bool
  default     = false
}

variable "labels" {
  description = "Labels applied to the service and revisions."
  type        = map(string)
  default     = {}
}
