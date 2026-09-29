variable "project_id" {
  description = "GCP project id."
  type        = string
}

variable "project_number" {
  description = "Numeric project number (for the Pub/Sub service agent identity)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must be numeric."
  }
}

variable "dataset_id" {
  description = "BigQuery dataset id."
  type        = string
  default     = "orenjitrade_analytics"

  validation {
    condition     = can(regex("^[A-Za-z0-9_]+$", var.dataset_id)) && length(var.dataset_id) <= 1024
    error_message = "dataset_id may only contain letters, digits and underscores."
  }
}

variable "events_table_id" {
  description = "Events table id."
  type        = string
  default     = "events"
}

variable "location" {
  description = "Dataset location (region or multi-region)."
  type        = string
  default     = "northamerica-northeast1"
}

variable "deletion_protection" {
  description = "Refuse to destroy the events table (prod)."
  type        = bool
  default     = false
}

variable "delete_contents_on_destroy" {
  description = "Delete tables when the dataset is destroyed (dev only)."
  type        = bool
  default     = false
}

variable "partition_expiration_days" {
  description = "Days before a partition expires (null = never)."
  type        = number
  default     = null
}

variable "reader_members" {
  description = "IAM members granted dataViewer on the dataset (analysts group)."
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels applied to the dataset and table."
  type        = map(string)
  default     = {}
}
