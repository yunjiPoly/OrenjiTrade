# Secret Manager containers + accessor bindings. Values are NOT managed here except for the
# ones an environment generates itself (db-password, redis-url, service-token via
# google_secret_manager_secret_version in the environment). Operator-provided values (Stripe
# keys, optional Firebase service account) are added with:
#   printf '%s' "$VALUE" | gcloud secrets versions add <secret> --data-file=- --project <project>

resource "google_secret_manager_secret" "this" {
  for_each = var.secrets

  project   = var.project_id
  secret_id = each.key
  labels    = merge(var.labels, { managed_by = "terraform" })

  annotations = {
    description = each.value.description
    populated   = each.value.terraform_managed ? "terraform" : "operator"
  }

  replication {
    auto {}
  }

  version_destroy_ttl = var.version_destroy_ttl
}

locals {
  accessor_bindings = merge([
    for secret_id, secret in var.secrets : {
      for member in secret.accessors :
      "${secret_id}|${member}" => { secret_id = secret_id, member = member }
    }
  ]...)
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = local.accessor_bindings

  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.value.secret_id].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
