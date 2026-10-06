# Cost guardrail: a monthly budget on the billing account, scoped to this project, with email
# alerts on actual spend (50%, 90%, 100%) and on the forecast (100%). Needs
# billingbudgets.googleapis.com and permissions on the BILLING ACCOUNT (roles/billing.costsManager
# or roles/billing.admin), which the environment's deployer identity does not have: apply this
# module with the owner's credentials (`terraform apply -target=module.billing_budget`).
#
# credit_types_treatment defaults to EXCLUDE_ALL_CREDITS so the alerts reflect list-price
# usage even while the US$300 free trial credit absorbs the invoice.

resource "google_billing_budget" "this" {
  billing_account = var.billing_account_id
  display_name    = var.display_name

  budget_filter {
    projects               = ["projects/${var.project_number}"]
    credit_types_treatment = var.credit_types_treatment
    calendar_period        = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.currency_code
      units         = tostring(var.amount_units)
    }
  }

  dynamic "threshold_rules" {
    for_each = var.threshold_rules
    content {
      threshold_percent = threshold_rules.value.threshold_percent
      spend_basis       = threshold_rules.value.spend_basis
    }
  }

  all_updates_rule {
    monitoring_notification_channels = var.notification_channels
    disable_default_iam_recipients   = var.disable_default_iam_recipients
  }
}
