variable "billing_account_id" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) the project is linked to."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    error_message = "billing_account_id must look like 012345-6789AB-CDEF01."
  }
}

variable "project_number" {
  description = "Numeric project number the budget is scoped to."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+$", var.project_number))
    error_message = "project_number must be numeric."
  }
}

variable "display_name" {
  description = "Budget display name (<= 60 chars)."
  type        = string
  default     = "OrenjiTrade monthly budget"

  validation {
    condition     = length(var.display_name) <= 60
    error_message = "display_name must be at most 60 characters."
  }
}

variable "amount_units" {
  description = "Monthly budget in whole currency units."
  type        = number
  default     = 150

  validation {
    condition     = var.amount_units >= 1 && floor(var.amount_units) == var.amount_units
    error_message = "amount_units must be a positive whole number."
  }
}

variable "currency_code" {
  description = "ISO 4217 currency code of the budget (must match the billing account currency)."
  type        = string
  default     = "USD"
}

variable "credit_types_treatment" {
  description = "INCLUDE_ALL_CREDITS (net of credits, i.e. the invoice) or EXCLUDE_ALL_CREDITS (list-price usage; recommended while the free trial credit applies)."
  type        = string
  default     = "EXCLUDE_ALL_CREDITS"

  validation {
    condition     = contains(["INCLUDE_ALL_CREDITS", "EXCLUDE_ALL_CREDITS"], var.credit_types_treatment)
    error_message = "credit_types_treatment must be INCLUDE_ALL_CREDITS or EXCLUDE_ALL_CREDITS."
  }
}

variable "threshold_rules" {
  description = "Alert thresholds as a fraction of the budget; spend_basis CURRENT_SPEND (actual) or FORECASTED_SPEND."
  type = list(object({
    threshold_percent = number
    spend_basis       = optional(string, "CURRENT_SPEND")
  }))
  default = [
    { threshold_percent = 0.5 },
    { threshold_percent = 0.9 },
    { threshold_percent = 1.0 },
    { threshold_percent = 1.0, spend_basis = "FORECASTED_SPEND" },
  ]

  validation {
    condition     = alltrue([for r in var.threshold_rules : r.threshold_percent > 0 && contains(["CURRENT_SPEND", "FORECASTED_SPEND"], r.spend_basis)])
    error_message = "threshold_percent must be > 0 and spend_basis CURRENT_SPEND or FORECASTED_SPEND."
  }
}

variable "notification_channels" {
  description = "Cloud Monitoring notification channel ids (email) that receive the alerts, max 5. Billing account admins/users also receive them unless disable_default_iam_recipients is true."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.notification_channels) <= 5
    error_message = "A budget supports at most 5 notification channels."
  }
}

variable "disable_default_iam_recipients" {
  description = "Do not email the billing account admins/users (only the notification channels)."
  type        = bool
  default     = false
}
