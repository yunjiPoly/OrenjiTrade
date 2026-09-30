# module: scheduler

Cloud Scheduler jobs invoking `https://api.<domain>/internal/jobs/*` with an OIDC token for the
`scheduler` service account. Defaults: `freshness` hourly (`15 * * * *`) and `delist` daily
(`30 5 * * *` UTC).

| Input | Default | Notes |
| --- | --- | --- |
| `base_url` | — | `https://api.orenjitrade.com` |
| `oidc_audience` | `base_url` | must be in the api service `custom_audiences` |
| `service_account_email` | — | scheduler SA |
| `jobs` | freshness + delist | `{ schedule, path, http_method?, time_zone?, attempt_deadline_seconds?, retry_count?, body?, paused? }` |

Outputs: `job_names`, `job_ids`.

Manual run: `gcloud scheduler jobs run <name> --location <region>`. Under the `local` Spring
profile the same endpoints are triggered by `@Scheduled` (ADR 0009).
