# module: storage

The `media` bucket for user uploads. Uniform bucket-level access with public access
prevention enforced (the API hands out V4 signed URLs for reads and uploads), CORS for direct
browser/mobile uploads, a lifecycle rule that purges `tmp/` after a couple of days, optional
versioning and soft delete.

| Input | Default | Notes |
| --- | --- | --- |
| `bucket_name` | — | `<project_id>-media` |
| `location` | `northamerica-northeast1` | |
| `cors_origins` | `[]` | `https://www.orenjitrade.com`, dev origins |
| `tmp_prefix` / `tmp_prefix_ttl_days` | `tmp/` / `2` | |
| `versioning_enabled` | `false` | prod: `true` |
| `soft_delete_retention_days` | `7` | |
| `force_destroy` | `false` | dev only |
| `object_admin_members` | `[]` | API runtime SA |
| `object_viewer_members` | `[]` | ML runtime SA |

Outputs: `bucket_name`, `bucket_url`, `bucket_self_link`.

**Terraform state bucket.** Not managed here. Create it once per environment before the
first `terraform init` (see `infrastructure/terraform/README.md`): versioning on, uniform
access, no public access, restricted to the operators and the deployer service account.
