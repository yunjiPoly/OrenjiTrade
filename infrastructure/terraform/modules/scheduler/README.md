# module: scheduler

Cloud Scheduler jobs invoking the API's `/internal/jobs/*` routes with an OIDC token for the
`scheduler` service account. The environments point `base_url` at the api service's
`*.run.app` URL: Cloud Scheduler is classified as **internal** ingress for a Cloud Run service
of the same project (Cloud Run docs, "Restricting network ingress"), so the calls never cross
Cloudflare or the load balancer, Cloud Run IAM (`roles/run.invoker`) is enforced, and the API
additionally verifies the token (`INTERNAL_AUDIENCE` = public API URL, listed in the service's
`custom_audiences`; `INTERNAL_INVOKERS` = scheduler SA email).

Default jobs (UTC; schedules from the controllers, `docs/api/contracts` and the `local`
profile `@Scheduled` cadences):

| Job | Schedule | Route | Source of the cadence |
| --- | --- | --- | --- |
| `freshness` | `15 * * * *` | `POST /internal/jobs/freshness` | hourly (phase3-inventory, `FreshnessScheduler` PT1H) |
| `offers-expire` | `5 * * * *` | `POST /internal/jobs/offers-expire` | hourly (phase8-offers-trades, `OfferExpiryScheduler` PT1H) |
| `account-deletion` | `20 * * * *` | `POST /internal/jobs/account-deletion` | hourly (`AccountDeletionScheduler` PT1H, 7-day grace) |
| `payments-auto-release` | `25 * * * *` | `POST /internal/jobs/payments-auto-release` | hourly (phase9-payments, `AutoReleaseScheduler` PT1H) |
| `credits-reconcile` | `35 * * * *` | `POST /internal/jobs/credits-reconcile` | hourly (`CreditReconcileScheduler` PT1H) |
| `subscriptions-period` | `40 * * * *` | `POST /internal/jobs/subscriptions-period` | hourly (`SubscriptionPeriodScheduler` PT1H) |
| `upload-cleanup` | `2/15 * * * *` | `POST /internal/jobs/upload-cleanup` | every 15 min (`UploadCleanupScheduler` PT15M) |
| `delist` | `30 5 * * *` | `POST /internal/jobs/delist` | daily (phase3-inventory, `DelistScheduler` P1D) |
| `card-images-reconcile` | `45 4 * * *` | `POST /internal/jobs/card-images/reconcile` | no documented cadence; daily chosen (idempotent, also runs at start-up) |

Not scheduled on purpose (one-off, admin or probe endpoints; a validation refuses them):
`POST /internal/jobs/ping`, `POST /internal/jobs/catalog-import` + `GET .../{id}`
(`npm run catalog:import`), `GET /internal/jobs/card-images/status`,
`POST /internal/jobs/card-images/clear` (destructive).

Cloud Scheduler pricing: 3 jobs free per billing account, then US$0.10 per job per month
(10 jobs here, about US$0.70/month).

| Input | Default | Notes |
| --- | --- | --- |
| `base_url` | — | api `run.app` URL (environments) |
| `oidc_audience` | `base_url` | environments pass `https://api.<domain>` |
| `service_account_email` | — | scheduler SA |
| `jobs` | the table above | `{ schedule, path, http_method?, time_zone?, attempt_deadline_seconds?, retry_count?, body?, paused? }` |

Outputs: `job_names`, `job_ids`.

Manual run: `gcloud scheduler jobs run <name> --location <region>`. Under the `local` Spring
profile the same endpoints are triggered by `@Scheduled` (ADR 0009).
