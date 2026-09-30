variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Region for the connector, subnet and NAT."
  type        = string
  default     = "northamerica-northeast1"

  validation {
    condition     = can(regex("^[a-z]+-[a-z]+[0-9]$", var.region))
    error_message = "region must look like northamerica-northeast1."
  }
}

variable "network_name" {
  description = "Name of the VPC network."
  type        = string
  default     = "orenjitrade"

  validation {
    condition     = can(regex("^[a-z]([-a-z0-9]{0,61}[a-z0-9])?$", var.network_name))
    error_message = "network_name must be a valid GCE resource name."
  }
}

variable "connector_name" {
  description = "Name of the Serverless VPC Access connector (max 25 chars)."
  type        = string
  default     = "orenjitrade-conn"

  validation {
    condition     = length(var.connector_name) <= 25 && can(regex("^[a-z]([-a-z0-9]*[a-z0-9])?$", var.connector_name))
    error_message = "connector_name must be a valid resource name of at most 25 characters."
  }
}

variable "connector_cidr" {
  description = "Dedicated /28 range for the connector subnet. Must not overlap other subnets or the PSA range."
  type        = string
  default     = "10.8.0.0/28"

  validation {
    condition     = can(cidrnetmask(var.connector_cidr)) && endswith(var.connector_cidr, "/28")
    error_message = "connector_cidr must be a /28 CIDR block."
  }
}

variable "connector_machine_type" {
  description = "Connector instance machine type (e2-micro, e2-standard-4, f1-micro)."
  type        = string
  default     = "e2-micro"

  validation {
    condition     = contains(["f1-micro", "e2-micro", "e2-standard-4"], var.connector_machine_type)
    error_message = "connector_machine_type must be one of f1-micro, e2-micro, e2-standard-4."
  }
}

variable "connector_min_instances" {
  description = "Minimum connector instances (>= 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.connector_min_instances >= 2
    error_message = "connector_min_instances must be at least 2."
  }
}

variable "connector_max_instances" {
  description = "Maximum connector instances (3-10, greater than min)."
  type        = number
  default     = 3

  validation {
    condition     = var.connector_max_instances >= 3 && var.connector_max_instances <= 10
    error_message = "connector_max_instances must be between 3 and 10."
  }
}

variable "private_service_access_prefix_length" {
  description = "Prefix length of the range reserved for Private Service Access (Cloud SQL, Memorystore)."
  type        = number
  default     = 16

  validation {
    condition     = var.private_service_access_prefix_length >= 16 && var.private_service_access_prefix_length <= 24
    error_message = "private_service_access_prefix_length must be between 16 and 24."
  }
}

variable "enable_cloud_nat" {
  description = "Create a Cloud Router + NAT so Cloud Run services with ALL_TRAFFIC egress can reach the public internet."
  type        = bool
  default     = true
}
