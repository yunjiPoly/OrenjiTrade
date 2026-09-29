# Least-privilege runtime and automation identities. Project-wide roles are limited to the
# ones that cannot be scoped to a resource (logging, monitoring, Cloud SQL client, Cloud Run
# developer for the deployer). Resource-scoped grants (secrets, buckets, topics, invoker,
# Artifact Registry) live in the modules that own those resources.

resource "google_service_account" "this" {
  for_each = var.service_accounts

  project      = var.project_id
  account_id   = "${var.name_prefix}${each.key}"
  display_name = each.value.display_name
  description  = each.value.description
}

locals {
  project_role_bindings = merge([
    for sa_key, sa in var.service_accounts : {
      for role in sa.project_roles :
      "${sa_key}|${role}" => { sa_key = sa_key, role = role }
    }
  ]...)
}

resource "google_project_iam_member" "project_roles" {
  for_each = local.project_role_bindings

  project = var.project_id
  role    = each.value.role
  member  = google_service_account.this[each.value.sa_key].member
}

# Whoever deploys a Cloud Run service must be allowed to "act as" its runtime SA.
locals {
  act_as_bindings = merge([
    for sa_key, sa in var.service_accounts : {
      for runtime_key in sa.act_as :
      "${sa_key}|${runtime_key}" => { actor = sa_key, target = runtime_key }
    }
  ]...)
}

resource "google_service_account_iam_member" "act_as" {
  for_each = local.act_as_bindings

  service_account_id = google_service_account.this[each.value.target].name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.this[each.value.actor].member
}
