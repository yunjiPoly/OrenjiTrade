# module: artifact-registry

Docker repository `orenjitrade` for the `api`, `web` (and `ml`) images, plus an optional
`dockerhub` **remote** repository (pull-through cache of Docker Hub) for third-party sidecar
images, so the Valkey/Redis sidecar is pinned by digest and pulled from Artifact Registry.

Cleanup policies on the standard repository (KEEP wins over DELETE):

| Policy | Effect |
| --- | --- |
| `delete-untagged` | untagged manifests older than `untagged_retention_days` (14) |
| `delete-old-tagged` | tagged versions older than `tagged_retention_days` (30) |
| `keep-recent-tagged` | always keep the `keep_tagged_versions` (10) most recent versions per image |
| `keep-release-tags` | always keep `v*` tags |

Net effect: about the last 10 builds of each image plus every release tag; everything else
goes after 30 days. Set `cleanup_policy_dry_run = true` to audit first.

| Input | Default | Notes |
| --- | --- | --- |
| `repository_id` | `orenjitrade` | |
| `untagged_retention_days` | `14` | |
| `tagged_retention_days` | `30` | |
| `keep_tagged_versions` | `10` | per image |
| `keep_package_name_prefixes` | `[]` | restrict the KEEP policy to some images |
| `cleanup_policy_dry_run` | `false` | |
| `create_dockerhub_remote` | `false` | environments set `true` for the sidecar image |
| `dockerhub_repository_id` | `dockerhub` | pull path `<region>-docker.pkg.dev/<project>/dockerhub/<namespace>/<image>` |
| `dockerhub_upstream_credentials` | `null` | optional Docker Hub login (secret version in Secret Manager) |
| `writer_members` / `reader_members` | `[]` | deployer SA / cross-project Cloud Run agents |

Outputs: `repository_id`, `repository_name`, `registry_host`, `repository_url`,
`dockerhub_repository_url` (null unless created).
