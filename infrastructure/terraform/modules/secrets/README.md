# module: secrets

Creates Secret Manager secrets (automatic replication) and per-secret
`roles/secretmanager.secretAccessor` bindings. Secret **values** are added either by the
environment (Terraform-generated `db-password`, `redis-url`, `service-token`) or by an operator
(`stripe-secret-key`, `stripe-webhook-secret`, optional `firebase-service-account`).

| Input | Notes |
| --- | --- |
| `secrets` | `map({ description, accessors = [members], terraform_managed = bool })` |
| `version_destroy_ttl` | default 7 days; destroyed versions stay recoverable |

Outputs: `secret_ids`, `secret_names`, `operator_managed_secret_ids`.

Rotation runbook: `docs/deployment/runbooks.md` ("Rotate a secret").
