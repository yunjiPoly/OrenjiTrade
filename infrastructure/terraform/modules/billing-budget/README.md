# module: billing-budget

`google_billing_budget` on the billing account, scoped to one project: US$150/month by
default with email alerts at 50%, 90% and 100% of the actual spend and at 100% of the
forecasted spend. Alerts go to the Cloud Monitoring notification channels passed in (the
monitoring module's email channel) and, unless disabled, to the billing account's admins.

| Input | Default | Notes |
| --- | --- | --- |
| `billing_account_id` | — | `XXXXXX-XXXXXX-XXXXXX` |
| `project_number` | — | scope of the budget |
| `display_name` | `OrenjiTrade monthly budget` | |
| `amount_units` / `currency_code` | `150` / `USD` | |
| `credit_types_treatment` | `EXCLUDE_ALL_CREDITS` | list-price usage even while the US$300 trial credit pays the invoice |
| `threshold_rules` | 0.5, 0.9, 1.0 actual + 1.0 forecast | |
| `notification_channels` | `[]` | max 5 |
| `disable_default_iam_recipients` | `false` | |

Outputs: `budget_name`, `amount`.

Permissions: creating a budget needs `roles/billing.costsManager` (or `billing.admin`) on the
**billing account**, which the project-level operator role and the WIF deployer SA do not
hold. Set `billing_account_id` in `terraform.tfvars` and run
`terraform apply -target=module.billing_budget` once with the owner's own credentials; later
applies without that permission would fail on this resource, so leave `billing_account_id`
unset (`null`) in tfvars used by other operators. Requires `billingbudgets.googleapis.com`
(enabled by the project-services module).

A budget never stops spending by itself; it only notifies. The hard limits are the sizing
variables (max instances, Cloud SQL tier) and the Maps JavaScript API quota set in the
console.
