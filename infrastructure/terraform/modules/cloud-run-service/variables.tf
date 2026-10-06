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

variable "container_name" {
  description = "Name of the main (ingress) container (null = the service name). deploy.yml updates the image with `gcloud run services update --container <name>`, so keep it stable."
  type        = string
  default     = null

  validation {
    condition     = var.container_name == null || can(regex("^[a-z]([-a-z0-9]{0,62})$", var.container_name))
    error_message = "container_name must be lowercase letters, digits and hyphens."
  }
}

variable "description" {
  description = "Free-text description."
  type        = string
  default     = ""
}

variable "image" {
  description = "Initial container image of the main container. Ignored after creation; CI deploys new images."
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

variable "execution_environment" {
  description = "EXECUTION_ENVIRONMENT_GEN2 (full Linux compatibility, minimum 512Mi per container) or EXECUTION_ENVIRONMENT_GEN1 (minimum 128Mi)."
  type        = string
  default     = "EXECUTION_ENVIRONMENT_GEN2"

  validation {
    condition     = contains(["EXECUTION_ENVIRONMENT_GEN1", "EXECUTION_ENVIRONMENT_GEN2"], var.execution_environment)
    error_message = "execution_environment must be EXECUTION_ENVIRONMENT_GEN1 or EXECUTION_ENVIRONMENT_GEN2."
  }
}

variable "container_port" {
  description = "Port the main container listens on."
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU limit of the main container: 1, 2, 4, 6, 8, or a fraction between 0.08 and 0.99 (fractions below 1 vCPU for the whole instance require request-based billing and concurrency 1)."
  type        = string
  default     = "1"

  validation {
    condition     = contains(["1", "2", "4", "6", "8"], var.cpu) || can(regex("^0\\.([0-9]{1,2})$", var.cpu))
    error_message = "cpu must be 1, 2, 4, 6, 8 or a fraction such as 0.5 (0.08-0.99)."
  }
}

variable "memory" {
  description = "Memory limit of the main container (e.g. \"512Mi\", \"1Gi\"). GEN2 needs at least 512Mi; instance-based billing (cpu_idle = false) needs at least 512Mi."
  type        = string
  default     = "512Mi"

  validation {
    condition     = can(regex("^[0-9]+(Mi|Gi)$", var.memory))
    error_message = "memory must look like 512Mi or 2Gi."
  }
}

variable "cpu_idle" {
  description = "true = CPU only allocated during requests (request-based billing); false = always allocated (instance-based billing, needed for background work / WebSockets). Applies to every container of the instance."
  type        = bool
  default     = true
}

variable "startup_cpu_boost" {
  description = "Give extra CPU during startup (JVM cold starts). With sidecars every container receives the boost."
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
  description = "Serverless VPC Access connector id (null = no connector). Mutually exclusive with vpc_subnetwork."
  type        = string
  default     = null
}

variable "vpc_network" {
  description = "Direct VPC egress: VPC network name (optional when vpc_subnetwork is set; must be the parent of the subnetwork)."
  type        = string
  default     = null
}

variable "vpc_subnetwork" {
  description = "Direct VPC egress: subnetwork name the instances get their IPs from (/26 or larger). null = no Direct VPC egress."
  type        = string
  default     = null

  validation {
    condition     = var.vpc_subnetwork == null || var.vpc_connector_id == null
    error_message = "Use either vpc_connector_id (Serverless VPC Access) or vpc_subnetwork (Direct VPC egress), not both."
  }
}

variable "vpc_network_tags" {
  description = "Direct VPC egress: network tags applied to the instances (firewall rules)."
  type        = list(string)
  default     = []
}

variable "vpc_egress" {
  description = "PRIVATE_RANGES_ONLY (only RFC 1918 / peered ranges go through the VPC, public calls go straight out) or ALL_TRAFFIC (everything through the VPC; needs Cloud NAT for public egress and is required to reach internal-ingress Cloud Run services)."
  type        = string
  default     = "PRIVATE_RANGES_ONLY"

  validation {
    condition     = contains(["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], var.vpc_egress)
    error_message = "vpc_egress must be PRIVATE_RANGES_ONLY or ALL_TRAFFIC."
  }
}

variable "env" {
  description = "Plain environment variables of the main container."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Environment variables of the main container sourced from Secret Manager: name => { secret = <secret id>, version = \"latest\" }."
  type = map(object({
    secret  = string
    version = optional(string, "latest")
  }))
  default = {}
}

variable "startup_probe" {
  description = "HTTP startup probe of the main container."
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
  description = "HTTP liveness probe of the main container (null to disable)."
  type = object({
    path                  = string
    initial_delay_seconds = optional(number, 0)
    period_seconds        = optional(number, 30)
    timeout_seconds       = optional(number, 3)
    failure_threshold     = optional(number, 3)
  })
  default = null
}

variable "sidecars" {
  description = <<-EOT
    Sidecar containers started before the main container (which `depends_on` all of them).
    Every sidecar should declare a startup probe (`tcp_port`, or `http_path` + `http_port`);
    without one Cloud Run does not wait for it to be healthy. Images should be pinned by digest
    and pulled through Artifact Registry (a remote repository for Docker Hub), never `:latest`.
    `cpu` may be fractional (0.08-0.99); Cloud Run does not document whether its "less than
    1 vCPU needs request-based billing and concurrency 1" rule is judged per container or per
    instance, so confirm a fractional sidecar next to a 1 vCPU main container at the first apply.
  EOT
  type = list(object({
    name    = string
    image   = string
    cpu     = optional(string, "0.5")
    memory  = optional(string, "512Mi")
    command = optional(list(string))
    args    = optional(list(string))
    env     = optional(map(string), {})
    startup_probe = optional(object({
      tcp_port              = optional(number)
      http_path             = optional(string)
      http_port             = optional(number)
      initial_delay_seconds = optional(number, 0)
      period_seconds        = optional(number, 5)
      timeout_seconds       = optional(number, 3)
      failure_threshold     = optional(number, 12)
    }))
    volume_mounts = optional(list(object({
      name       = string
      mount_path = string
    })), [])
  }))
  default = []

  validation {
    condition     = alltrue([for s in var.sidecars : can(regex("^[a-z]([-a-z0-9]{0,62})$", s.name))])
    error_message = "Sidecar names must be lowercase letters, digits and hyphens."
  }

  validation {
    condition     = alltrue([for s in var.sidecars : contains(["1", "2", "4", "6", "8"], s.cpu) || can(regex("^0\\.([0-9]{1,2})$", s.cpu))])
    error_message = "Sidecar cpu must be 1, 2, 4, 6, 8 or a fraction such as 0.25."
  }

  validation {
    condition     = alltrue([for s in var.sidecars : can(regex("^[0-9]+(Mi|Gi)$", s.memory))])
    error_message = "Sidecar memory must look like 256Mi or 1Gi."
  }

  validation {
    condition     = alltrue([for s in var.sidecars : s.startup_probe == null || (s.startup_probe.tcp_port != null) != (s.startup_probe.http_path != null)])
    error_message = "A sidecar startup probe needs exactly one of tcp_port or http_path."
  }

  validation {
    condition     = alltrue([for s in var.sidecars : !can(regex(":latest$", s.image))])
    error_message = "Sidecar images must not use the :latest tag; pin a version tag or a digest."
  }
}

variable "volumes" {
  description = "In-memory (empty_dir) volumes shared by the containers of the instance; size counts against the instance memory."
  type = list(object({
    name       = string
    size_limit = optional(string)
  }))
  default = []
}

variable "volume_mounts" {
  description = "Volume mounts of the main container ({ name, mount_path })."
  type = list(object({
    name       = string
    mount_path = string
  }))
  default = []
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
