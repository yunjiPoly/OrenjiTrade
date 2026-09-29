# Deferred cloud deployment work

**Decision (owner, 2026-09-29):** all Google Cloud, staging and production deployment work is
postponed. The project must be fully runnable and testable on a developer machine first. The
cloud design (ADRs, Terraform, Cloudflare docs, Dockerfiles, deploy workflows) stays intact so
deployment can resume later without redesigning the application.

## What stays in the repository, unchanged in intent

- Terraform modules and `environments/{dev,staging,prod}` plus Cloudflare Terraform. CI still runs
  `terraform fmt -check` and `terraform validate` (no provider credentials needed).
- Dockerfiles for `api`, `web`, `ml` (built locally and in CI; never pushed anywhere).
- Production configuration: Spring profiles `dev`, `staging`, `prod`; Firebase Admin SDK with
  Application Default Credentials; `GcsObjectStorage`, Pub/Sub transport, FCM, Stripe adapters
  are selected only by environment variables and are never required locally.
- `docs/deployment/*`, `infrastructure/cloudflare/README.md`.

## What was switched off

| Item | Change | How to restore |
| --- | --- | --- |
| `.github/workflows/docker-build.yml` | push/tag triggers removed; manual `workflow_dispatch` only | re-add `push: { branches: [main], tags: ["v*"] }` |
| `.github/workflows/deploy.yml` | automatic `workflow_run` after Docker build removed; manual only | re-add the commented `workflow_run` block |

Nothing runs `terraform plan/apply`, `gcloud`, or pushes to Artifact Registry.

## Phase 14 items intentionally deferred

1. GCP projects per environment, billing, API enablement, Terraform state bucket.
2. `terraform apply` for network, Cloud SQL (PostGIS), Memorystore, GCS, Pub/Sub, BigQuery,
   Secret Manager, Artifact Registry, service accounts, Workload Identity Federation, Cloud Run
   services, external HTTPS load balancer, Cloud Scheduler, monitoring and alerting.
3. Repository variables for WIF (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOYER_SA`,
   `GCP_PROJECT_ID`, `GCP_REGION`) and GitHub environments with approvals.
4. Real Firebase / Identity Platform project (email, Google, Apple providers, authorized
   domains, admin MFA) replacing the Auth emulator.
5. Real provider credentials: Stripe Connect + Billing, FCM, transactional email, Google Maps
   browser key (the web keeps the Leaflet/OpenStreetMap adapter until then).
6. Cloudflare DNS records, TLS, WAF, cache and rate-limit rules for `www`/`api.orenjitrade.com`.
7. Pub/Sub → BigQuery analytics pipeline and dashboards (Phase 12 cloud half).
8. Production secrets (`SERVICE_TOKEN`, `LOCATION_JITTER_SECRET`, `CONSENT_IP_SALT`, database
   and Redis credentials) in Secret Manager.
9. Legal review of all policy pages before any public launch.

The Python ML card-recognition work (Phase 11) is separately **on hold** by owner instruction.
