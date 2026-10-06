output "budget_name" {
  description = "Resource name of the budget (billingAccounts/../budgets/..)."
  value       = google_billing_budget.this.name
}

output "amount" {
  description = "Monthly budget amount and currency."
  value       = "${var.amount_units} ${var.currency_code}"
}
