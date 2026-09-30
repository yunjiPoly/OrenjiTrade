# module: artifact-registry

Docker repository `orenjitrade` in the environment region with cleanup policies (drop
untagged images after 14 days, always keep the 20 most recent versions and every `v*`
release tag) and IAM bindings for pushers (GitHub deployer SA) and optional readers.

| Input | Default |
| --- | --- |
| `repository_id` | `orenjitrade` |
| `untagged_retention_days` | `14` |
| `keep_tagged_versions` | `20` |
| `writer_members` | `[]` |
| `reader_members` | `[]` |

Outputs: `repository_id`, `repository_name`, `registry_host`, `repository_url`.

Images are named `<repository_url>/<api|web|ml>:<git sha>` and `:latest`
(`.github/workflows/docker-build.yml`).
