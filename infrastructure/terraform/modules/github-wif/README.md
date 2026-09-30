# module: github-wif

Workload Identity Federation pool `github` + OIDC provider `github-oidc` trusting
`token.actions.githubusercontent.com`, restricted with an attribute condition to
`assertion.repository == "<owner/repo>"` (optionally to specific refs), and the
`roles/iam.workloadIdentityUser` binding that lets that repository impersonate the
`github-deployer` service account. No service-account keys are ever created.

| Input | Default | Notes |
| --- | --- | --- |
| `github_repository` | — | `owner/name` |
| `allowed_refs` | `[]` | e.g. `["refs/heads/main"]` for prod |
| `pool_id` / `provider_id` | `github` / `github-oidc` | |
| `deployer_service_account_name` | — | `projects/<p>/serviceAccounts/<email>` |

Outputs: `workload_identity_provider` (store as repository/environment variable
`GCP_WORKLOAD_IDENTITY_PROVIDER`), `pool_name`, `attribute_condition`.

Bootstrap order matters: apply this module (with `service-accounts`) before the first image
build so `docker-build.yml` can authenticate. See `docs/deployment/README.md`.
