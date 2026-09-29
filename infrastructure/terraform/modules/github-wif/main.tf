# Workload Identity Federation for GitHub Actions: no service-account keys anywhere.
# The OIDC provider only trusts tokens whose `repository` claim equals var.github_repository
# (and optionally whose ref is in var.allowed_refs); the deployer SA can then be impersonated
# by `google-github-actions/auth@v2` with `workload_identity_provider` + `service_account`.

locals {
  ref_condition = length(var.allowed_refs) == 0 ? "" : " && assertion.ref in [${join(", ", [for r in var.allowed_refs : "\"${r}\""])}]"

  attribute_condition = "assertion.repository == \"${var.github_repository}\"${local.ref_condition}"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = var.pool_id
  display_name              = "GitHub Actions"
  description               = "Identity pool for GitHub Actions OIDC tokens."
  disabled                  = false
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.provider_id
  display_name                       = "GitHub OIDC"
  description                        = "Trusts token.actions.githubusercontent.com for ${var.github_repository}."
  disabled                           = false

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.actor"               = "assertion.actor"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_owner"    = "assertion.repository_owner"
    "attribute.ref"                 = "assertion.ref"
    "attribute.workflow_ref"        = "assertion.job_workflow_ref"
    "attribute.environment"         = "assertion.environment"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }

  attribute_condition = local.attribute_condition

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Every workflow run of the repository may impersonate the deployer SA.
resource "google_service_account_iam_member" "deployer_workload_identity_user" {
  service_account_id = var.deployer_service_account_name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
