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
  description = "Cloud SQL instance name. Names cannot be reused for about a week after deletion; suffix with the environment."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,96}$", var.instance_name))
    error_message = "instance_name must start with a letter and contain lowercase letters, digits and hyphens."
  }
}

variable "network_id" {
  description = "VPC network id (projects/../global/networks/..) that has Private Service Access configured."
  type        = string
}

variable "allocated_ip_range" {
  description = "Name of the reserved PSA range to allocate the private IP from (optional)."
  type        = string
  default     = null
}

variable "tier" {
  description = "Machine tier, e.g. db-f1-micro, db-g1-small, db-custom-2-7680."
  type        = string
  default     = "db-f1-micro"

  validation {
    condition     = can(regex("^db-(f1-micro|g1-small|custom-[0-9]+-[0-9]+|perf-optimized-N-[0-9]+)$", var.tier))
    error_message = "tier must be a Cloud SQL tier such as db-f1-micro, db-g1-small or db-custom-<cpu>-<mem_mb>."
  }
}

variable "edition" {
  description = "Cloud SQL edition (ENTERPRISE or ENTERPRISE_PLUS). Set explicitly: for PostgreSQL 16+ the API defaults to ENTERPRISE_PLUS, which has no shared-core tiers (db-f1-micro, db-g1-small) and costs more."
  type        = string
  default     = "ENTERPRISE"

  validation {
    condition     = contains(["ENTERPRISE", "ENTERPRISE_PLUS"], var.edition)
    error_message = "edition must be ENTERPRISE or ENTERPRISE_PLUS."
  }

  validation {
    condition     = var.edition == "ENTERPRISE" || !can(regex("^db-(f1-micro|g1-small)$", var.tier))
    error_message = "Shared-core tiers (db-f1-micro, db-g1-small) exist only in the ENTERPRISE edition."
  }
}

variable "availability_type" {
  description = "ZONAL (single zone) or REGIONAL (HA with automatic failover)."
  type        = string
  default     = "ZONAL"

  validation {
    condition     = contains(["ZONAL", "REGIONAL"], var.availability_type)
    error_message = "availability_type must be ZONAL or REGIONAL."
  }
}

variable "disk_size_gb" {
  description = "Initial SSD size in GB (auto-resize is on)."
  type        = number
  default     = 10

  validation {
    condition     = var.disk_size_gb >= 10
    error_message = "disk_size_gb must be at least 10."
  }
}

variable "deletion_protection" {
  description = "Protect the instance from deletion (Terraform and API level). Always true in prod."
  type        = bool
  default     = false
}

variable "point_in_time_recovery_enabled" {
  description = "Enable write-ahead log archiving for point-in-time recovery."
  type        = bool
  default     = true
}

variable "transaction_log_retention_days" {
  description = "Days of transaction logs kept for PITR (1-7 on ENTERPRISE, 1-35 on ENTERPRISE_PLUS)."
  type        = number
  default     = 7

  validation {
    condition     = var.transaction_log_retention_days >= 1 && var.transaction_log_retention_days <= 35
    error_message = "transaction_log_retention_days must be between 1 and 35."
  }

  validation {
    condition     = var.edition == "ENTERPRISE_PLUS" || var.transaction_log_retention_days <= 7
    error_message = "Cloud SQL Enterprise edition retains at most 7 days of transaction logs; use ENTERPRISE_PLUS for up to 35."
  }
}

variable "retained_backups" {
  description = "Number of automated backups to keep."
  type        = number
  default     = 7

  validation {
    condition     = var.retained_backups >= 1 && var.retained_backups <= 365
    error_message = "retained_backups must be between 1 and 365."
  }
}

variable "backup_start_time_utc" {
  description = "Daily backup window start (HH:MM, UTC)."
  type        = string
  default     = "07:00"

  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):[0-5][0-9]$", var.backup_start_time_utc))
    error_message = "backup_start_time_utc must be HH:MM."
  }
}

variable "backup_location" {
  description = "Multi-region or region for backups (null = instance region)."
  type        = string
  default     = null
}

variable "maintenance_window_day" {
  description = "Maintenance day (1 = Monday ... 7 = Sunday)."
  type        = number
  default     = 7

  validation {
    condition     = var.maintenance_window_day >= 1 && var.maintenance_window_day <= 7
    error_message = "maintenance_window_day must be 1-7."
  }
}

variable "maintenance_window_hour_utc" {
  description = "Maintenance hour (0-23, UTC)."
  type        = number
  default     = 8

  validation {
    condition     = var.maintenance_window_hour_utc >= 0 && var.maintenance_window_hour_utc <= 23
    error_message = "maintenance_window_hour_utc must be 0-23."
  }
}

variable "database_flags" {
  description = "PostgreSQL flags to set on the instance."
  type = list(object({
    name  = string
    value = string
  }))
  default = [
    { name = "log_min_duration_statement", value = "500" },
    { name = "cloudsql.enable_pg_stat_statements", value = "on" },
  ]
}

variable "database_name" {
  description = "Application database name."
  type        = string
  default     = "orenjitrade"
}

variable "app_user_name" {
  description = "Application database user."
  type        = string
  default     = "orenjitrade"
}

variable "app_user_password" {
  description = "Password of the application user. Generate it with random_password and store it in Secret Manager; never put it in tfvars."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.app_user_password) >= 16
    error_message = "app_user_password must be at least 16 characters."
  }
}

variable "labels" {
  description = "Labels applied to the instance."
  type        = map(string)
  default     = {}
}
