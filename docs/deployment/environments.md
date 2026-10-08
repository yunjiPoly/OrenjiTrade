# Environments

Four environments: `local` (Docker Compose on a laptop) and three Google Cloud root modules.
Each cloud environment is an independent Terraform root module under
`infrastructure/terraform/environments/<env>` with its own state bucket, GCP project, Cloud SQL
instance, secrets and service accounts. **Year one runs prod only** (ADR 0016): dev is optional
and staging is created on demand and destroyed afterwards (`README.md` section 12). Project ids
below are fictional placeholders; the real ones live in each environment's git-ignored
`terraform.tfvars` and in GitHub environment variables.

## Matrix

| | local | dev (optional) | staging (temporary) | prod |
| --- | --- | --- | --- | --- |
| GCP project | — | `orenjitrade-dev-123456` | `orenjitrade-staging-123456` | `orenjitrade-prod-123456` |
| Region | — | `northamerica-northeast1` | `northamerica-northeast1` | `northamerica-northeast1` |
| Web host | `localhost:4200` | `dev.orenjitrade.com` | `staging.orenjitrade.com` | `www.orenjitrade.com` |
| API host | `localhost:8080` | `dev-api.orenjitrade.com` | `staging-api.orenjitrade.com` | `api.orenjitrade.com` |
| Spring profile (`SPRING_PROFILES_ACTIVE`) | `local` | `dev` | `staging` | `prod` |
| `ORENJI_ENV` (`GET /api/v1/meta`) | `local` | `development` | `staging` | `production` |
| Cloud SQL | `postgis/postgis:17-3.5` container | `db-f1-micro`, ZONAL, Enterprise, PITR 7 d, 7 backups | `db-g1-small`, ZONAL, Enterprise, PITR 7 d, 7 backups | `db-g1-small`, ZONAL, **Enterprise** (explicit), 10 GB SSD auto-resize, PITR 7 d, 7 backups, deletion protection |
| `DATABASE_POOL_SIZE` / connection alert | 10 | 10 / 20 | 10 / 40 | 10 / 40 (`max_connections` 50) |
| Redis | `redis:7` container | Valkey sidecar | Valkey sidecar | **Valkey 8.1 sidecar** in the api instance (`127.0.0.1`, no persistence, 200 MB `allkeys-lru`, 0.1 vCPU / 512 MiB); Memorystore only with `redis_mode = memorystore` |
| api Cloud Run | `gradlew bootRun` | 1 vCPU / 1 GiB, 0–1 | 1 vCPU / 1 GiB, 0–1 | 1 vCPU / 1 GiB (+ sidecar), **1–1** instance, CPU always allocated, heap 50 % |
| web Cloud Run | `npm start` | 1 vCPU / 512 MiB, 0–2 | 1 vCPU / 512 MiB, 0–2 | 1 vCPU / 512 MiB, 0–2, every `config.json` value from Terraform |
| ml Cloud Run | `uvicorn` | not instantiated | not instantiated | **not instantiated** (`ml_enabled = false`, Phase 11 on hold) |
| VPC egress | — | Direct VPC egress `/24`, `PRIVATE_RANGES_ONLY` | same | same; no connector, no Cloud NAT (both available behind `enable_vpc_connector` / `enable_cloud_nat` for the ML path) |
| Certificate | — | Certificate Manager, DNS authorization | same | **Certificate Manager, DNS authorization** (`_acme-challenge` CNAMEs DNS-only in Cloudflare); Origin CA fallback |
| Deletion protection | — | off | off | **on** (SQL, BigQuery table, Cloud Run) |
| Cloud Armor Cloudflare-only origin | — | off | **on** | **on** |
| Media bucket | `./.local-storage` | `<project>-media`, force-destroy | `<project>-media`, `storage_force_destroy = true` in its tfvars for the teardown | `<project>-media`, versioning on, public access prevented; card image renditions under `card-images/` (ADR 0015) |
| Card image cache | files under `CARD_IMAGE_CACHE_DIR` | bucket prefix, temps on `/tmp` | same | same (5 GB cap enforced from PostgreSQL) |
| BigQuery partition expiry | — | 90 days | 180 days | never |
| Identity | Firebase Auth emulator | Firebase project (dev) | Firebase project (staging) | Identity Platform + MFA |
| Payments | `FakePaymentProvider` | fake (Stripe test keys optional) | Stripe **test** keys | fake until Stripe secrets exist, then Stripe live keys behind `protectedPayments` |
| Events | in-process outbox | outbox; analytics to Pub/Sub | same | outbox; analytics to Pub/Sub → BigQuery; `domain-events` push off until the receiver exists |
| Scheduled jobs | `@Scheduled` under `local` | 10 Cloud Scheduler jobs | 10 | 10 (every scheduled `/internal/jobs/*` route) |
| Images | local build | built here (`docker-build.yml`) | pulled from the build registry | pulled from the build registry (prod's own when there is no dev project) |
| Deploy trigger | manual | manual `deploy.yml` | manual `deploy.yml`, approval | manual `deploy.yml`, approval, `main`/`v*` only |
| WIF refs allowed | — | any ref of the repo | any ref | `refs/heads/main` |
| Budget | — | — | — | US$150/month (`billing_account_id`, owner-applied) |
| Data | fictional seed (`db/seed`) | fictional seed | anonymised/fictional only | real user data |

## Secrets per environment (Secret Manager)

| Secret | Populated by | Accessors | Required at start-up | Notes |
| --- | --- | --- | --- | --- |
| `db-password` | Terraform (`random_password`) | api-run | yes | Cloud SQL application user |
| `service-token` | Terraform | api-run (+ ml-run when enabled) | yes (`ServiceTokenStartupValidator`) | `/internal/**` shared secret for operator scripts |
| `analytics-actor-salt` | Terraform | api-run | yes (`AnalyticsConfig`) | pseudonymises actors in analytics events |
| `ads-token-secret` | Terraform | api-run | yes (`AdsConfig`) | HMAC of ad serve tokens |
| `consent-ip-salt` | Terraform | api-run | no (default refused only by review) | hashed client IP stored with consents |
| `redis-url` | Terraform (Memorystore AUTH) | api-run | — | only with `redis_mode = memorystore`; the sidecar uses plain `REDIS_URL=redis://localhost:6379` |
| `stripe-secret-key` | operator (`gcloud secrets versions add`) | api-run | when `stripe_secrets_enabled` | restricted key |
| `stripe-webhook-secret` | operator | api-run | when `stripe_secrets_enabled` | payments webhook |
| `stripe-billing-webhook-secret` | operator | api-run | when `billing_provider = stripe` | subscriptions webhook |
| `firebase-service-account` | operator, optional | api-run | no | only if ADC is insufficient |

Public configuration that is **not** secret and is passed as plain environment: the Firebase web
config (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`),
`WS_BASE_URL`, the Stripe price id,
`INTERNAL_AUDIENCE` / `INTERNAL_INVOKERS`, `STORAGE_PUBLIC_BASE_URL`, `CARD_IMAGE_CACHE_DIR`.

## GitHub environments and approvers

| GitHub environment | Required reviewers | Deployment branches | Variables (override repository defaults) |
| --- | --- | --- | --- |
| `dev` (optional) | none | any | — (repository-level `GCP_*` point at dev when it exists) |
| `staging` (temporary) | 1 maintainer (not the requester) | `main`, `v*` | `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOYER_SA` for the staging project |
| `prod` | 2 maintainers incl. the on-call owner, 10-minute wait timer | `main`, `v*` | same for the prod project; `DEPLOY_ML` unset |

Configure under **Settings > Environments**. Approvals are recorded on the deployment and are
the audit trail for production releases. `GCP_IMAGE_REGISTRY` (repository level) points at the
registry where `docker-build.yml` publishes (prod's own in the prod-only setup); other projects'
Cloud Run service agents get `artifactregistry.reader` on it through
`artifact_registry_reader_members`.

## Service accounts (per project)

| Account | Used by | Scoped grants |
| --- | --- | --- |
| `api-run` | api Cloud Run | cloudsql.client, log/metric/trace writers, firebaseauth.admin, firebasecloudmessaging.admin; secret accessor on its secrets; objectAdmin on the media bucket (media + `card-images/`); publisher on topics |
| `web-run` | web Cloud Run | log/metric writers |
| `ml-run` | ml Cloud Run (exists, unused while `ml_enabled = false`) | log/metric/trace writers; objectViewer on the media bucket and secret accessor on `service-token` only when enabled |
| `scheduler` | Cloud Scheduler OIDC | invoker on api; listed in `INTERNAL_INVOKERS` |
| `pubsub-push` | Pub/Sub push OIDC | invoker on api; listed in `INTERNAL_INVOKERS` (no push subscription until the receiver exists) |
| `github-deployer` | GitHub Actions via WIF | run.developer, actAs the runtime SAs, artifactregistry.writer (impersonation via the WIF `workloadIdentityUser` binding) |

## Promotion flow

`main` merge -> CI -> **Docker build** (manual dispatch from `main`: `:sha`, `:latest`) ->
manual deploy **prod** with the sha or a `vX.Y.Z` tag (approvals + wait timer) -> post-deploy
checks (`README.md` section 11) -> announce in the release channel. When a change deserves a
rehearsal, bring staging up first (`README.md` section 12), deploy the same sha there, test,
tear it down.
