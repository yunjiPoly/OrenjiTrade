variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "region" {
  description = "Instance region."
  type        = string
  default     = "northamerica-northeast1"
}

variable "instance_name" {
  description = "Memorystore instance id."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,38}[a-z0-9]$", var.instance_name))
    error_message = "instance_name must be 2-40 chars: lowercase letters, digits, hyphens."
  }
}

variable "display_name" {
  description = "Human-readable name."
  type        = string
  default     = "OrenjiTrade Redis"
}

variable "network_id" {
  description = "VPC network id with Private Service Access configured."
  type        = string
}

variable "tier" {
  description = "BASIC (no replication, dev) or STANDARD_HA (replicated, prod)."
  type        = string
  default     = "BASIC"

  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.tier)
    error_message = "tier must be BASIC or STANDARD_HA."
  }
}

variable "memory_size_gb" {
  description = "Memory in GB (BASIC: 1-300, STANDARD_HA: 5-300)."
  type        = number
  default     = 1

  validation {
    condition     = var.memory_size_gb >= 1 && var.memory_size_gb <= 300
    error_message = "memory_size_gb must be between 1 and 300."
  }
}

variable "replica_count" {
  description = "Read replicas (STANDARD_HA only, 0-5)."
  type        = number
  default     = 0

  validation {
    condition     = var.replica_count >= 0 && var.replica_count <= 5
    error_message = "replica_count must be between 0 and 5."
  }
}

variable "redis_version" {
  description = "Redis version."
  type        = string
  default     = "REDIS_7_2"

  validation {
    condition     = can(regex("^REDIS_[0-9]+_[0-9]+$", var.redis_version))
    error_message = "redis_version must look like REDIS_7_2."
  }
}

variable "transit_encryption_mode" {
  description = "SERVER_AUTHENTICATION (TLS) or DISABLED. The app must trust the Memorystore CA when TLS is on."
  type        = string
  default     = "DISABLED"

  validation {
    condition     = contains(["DISABLED", "SERVER_AUTHENTICATION"], var.transit_encryption_mode)
    error_message = "transit_encryption_mode must be DISABLED or SERVER_AUTHENTICATION."
  }
}

variable "persistence_enabled" {
  description = "Enable RDB snapshots (useful to survive maintenance without a cold cache)."
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Refuse to delete the instance."
  type        = bool
  default     = false
}

variable "labels" {
  description = "Labels applied to the instance."
  type        = map(string)
  default     = {}
}
