# Environments

Four environments: `local` (Docker Compose on a laptop) and three Google Cloud projects. Each
cloud environment is an independent Terraform root module under
`infrastructure/terraform/environments/<env>` with its own state bucket, Cloud SQL instance,
secrets and service accounts. Project ids below are fictional placeholders; the real ones live
in each environment's git-ignored `terraform.tfvars` and in GitHub environment variables.

## Matrix

| | local | dev | staging | prod |
| --- | --- | --- | --- | --- |
| GCP project | — | `orenjitrade-dev-123456` | `orenjitrade-staging-123456` | `orenjitrade-prod-123456` |
| Region | — | `northamerica-northeast1` | `northamerica-northeast1` | `northamerica-northeast1` |
| Web host | `localhost:4200` | `dev.orenjitrade.com` | `staging.orenjitrade.com` | `www.orenjitrade.com` |
| API host | `localhost:8080` | `dev-api.orenjitrade.com` | `staging-api.orenjitrade.com` | `api.orenjitrade.com` |
| Spring profile | `local` | `development` | `staging` | `production` |
| Cloud SQL | `postgis/postgis:17-3.5` container | `db-f1-micro`, ZONAL, PITR 7 d, 7 backups | `db-g1-small`, ZONAL, PITR 7 d, 7 backups | `db-custom-2-7680`, REGIONAL (HA), PITR 7 d, 30 backups |
| Redis | `redis:7` container | BASIC 1 GB | BASIC 1 GB | STANDARD_HA 5 GB + 1 replica, RDB persistence |
| api Cloud Run | `gradlew bootRun` | 1 vCPU / 1 GiB, 0-3 instances | 1 vCPU / 1 GiB, 0-5 | 2 vCPU / 2 GiB, **1**-20 instances |
| web Cloud Run | `npm start` | 1 vCPU / 256 MiB, 0-3 | 1 vCPU / 256 MiB, 0-5 | 1 vCPU / 512 MiB, 1-10 |
| ml Cloud Run | `uvicorn` | 1 vCPU / 1 GiB, 0-2 | 1 vCPU / 1 GiB, 0-3 | 2 vCPU / 2 GiB, 0-5 |
| VPC connector | — | e2-micro 2-3 | e2-micro 2-3 | e2-micro 2-10 |
| Deletion protection | — | off | off | **on** (SQL, Redis, BigQuery table, Cloud Run) |
| Cloud Armor Cloudflare-only origin | — | off | **on** | **on** |
| Media bucket | `./.local-storage` | `<project>-media`, force-destroy | `<project>-media`, versioning off | `<project>-media`, versioning on |
| BigQuery partition expiry | — | 90 days | 180 days | never |
| Identity | Firebase Auth emulator | Firebase project (dev) | Firebase project (staging) | Identity Platform + MFA |
| Payments | `FakePaymentProvider` | fake (Stripe test keys optional) | Stripe **test** keys | Stripe live keys, `protectedPayments` flag |
| Events | in-process outbox | Pub/Sub | Pub/Sub | Pub/Sub |
| Images | local build | built here (`docker-build.yml`) | pulled from dev registry | pulled from dev registry |
| Deploy trigger | manual | automatic after Docker build on `main` | manual `deploy.yml`, approval | manual `deploy.yml`, approval, `main`/`v*` only |
| WIF refs allowed | — | any ref of the repo | any ref (tighten to `main` when stable) | `refs/heads/main` |
| Data | fictional seed (`db/seed`) | fictional seed | anonymised/fictional only | real user data |

## Secrets per environment (Secret Manager)

| Secret | Populated by | Accessors | dev | staging | prod |
| --- | --- | --- | --- | --- | --- |
| `db-password` | Terraform (`random_password`) | api-run | yes | yes | yes |
| `redis-url` | Terraform (Memorystore AUTH) | api-run | yes | yes | yes |
| `service-token` | Terraform | api-run, ml-run | yes | yes | yes |
| `stripe-secret-key` | operator (`gcloud secrets versions add`) | api-run | optional (test) | test key | live restricted key |
| `stripe-webhook-secret` | operator | api-run | optional | yes | yes |
| `firebase-service-account` | operator, optional | api-run | no | no | only if ADC is insufficient |

Public configuration that is **not** secret and lives in the frontends: Firebase web config,
Google Maps browser key (referrer-restricted), Stripe publishable key.

## GitHub environments and approvers

| GitHub environment | Required reviewers | Deployment branches | Variables (override repository defaults) |
| --- | --- | --- | --- |
| `dev` | none | any | — (repository-level `GCP_*` point at dev) |
| `staging` | 1 maintainer (not the requester) | `main`, `v*` | `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOYER_SA` for the staging project |
| `prod` | 2 maintainers incl. the on-call owner, 10-minute wait timer | `main`, `v*` | same for the prod project |

Configure under **Settings > Environments**. Approvals are recorded on the deployment and are
the audit trail for production releases. `GCP_IMAGE_REGISTRY` (repository level) points at the
dev registry where `docker-build.yml` publishes; staging/prod Cloud Run service agents have
`artifactregistry.reader` on it (`artifact_registry_reader_members` in dev's tfvars).

## Service accounts (per project)

| Account | Used by | Scoped grants |
| --- | --- | --- |
| `api-run` | api Cloud Run | cloudsql.client, log/metric/trace writers, firebaseauth.admin, firebasecloudmessaging.admin; secret accessor on its secrets; objectAdmin on media bucket; publisher on topics; invoker on ml |
| `web-run` | web Cloud Run | log/metric writers |
| `ml-run` | ml Cloud Run | log/metric/trace writers; objectViewer on media bucket; secret accessor on `service-token` |
| `scheduler` | Cloud Scheduler OIDC | invoker on api |
| `pubsub-push` | Pub/Sub push OIDC | invoker on api and ml |
| `github-deployer` | GitHub Actions via WIF | run.developer, actAs the three runtime SAs, artifactregistry.writer (impersonation via the WIF `workloadIdentityUser` binding) |

## Promotion flow

`main` merge -> CI -> Docker build (`:sha`, `:latest`) -> auto deploy **dev** -> manual deploy
**staging** with the same sha (approval) -> smoke + exploratory tests -> tag `vX.Y.Z` -> manual
deploy **prod** with the sha or tag (approvals + wait timer) -> post-deploy checks
(`README.md` step 10) -> announce in the release channel.
