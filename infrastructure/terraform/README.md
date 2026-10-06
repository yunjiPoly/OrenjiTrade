# OrenjiTrade infrastructure (Terraform)

Google Cloud resources for every environment, composed from reusable modules. Cloudflare
(DNS, cache, WAF) lives next door in `infrastructure/cloudflare`. Architecture context:
`docs/architecture/ARCHITECTURE.md` section 10, ADR 0003 (Cloud Run before GKE) and ADR 0016
(low-cost first-year production profile).

## Layout

```
infrastructure/terraform/
├── modules/                    # reusable building blocks, one directory each
│   ├── project-services        # enable APIs (incl. Certificate Manager, Billing Budgets)
│   ├── network                 # VPC, PSA peering, Direct VPC egress subnet; optional connector + Cloud NAT
│   ├── cloud-sql               # PostgreSQL 17 (PostGIS via Flyway), Enterprise edition, private IP, backups + PITR
│   ├── redis                   # Memorystore (scale-up path only; the default profile runs a Valkey sidecar)
│   ├── storage                 # media bucket (uniform access, CORS, tmp/ lifecycle)
│   ├── pubsub                  # topics + DLQs, push subscriptions (OIDC), BigQuery subscription
│   ├── bigquery                # orenjitrade_analytics.events (partitioned/clustered)
│   ├── artifact-registry       # docker repo `orenjitrade` (+ `dockerhub` remote cache), cleanup keeps ~10 images
│   ├── secrets                 # Secret Manager containers + accessor IAM
│   ├── service-accounts        # api-run, web-run, ml-run, scheduler, pubsub-push, github-deployer
│   ├── cloud-run-service       # generic Cloud Run v2 service (sidecars, Direct VPC egress)
│   ├── load-balancer           # global HTTPS LB, Certificate Manager (DNS auth) / Origin CA, redirect, Cloud Armor
│   ├── scheduler               # every scheduled /internal/jobs/* route (10 jobs)
│   ├── monitoring              # uptime checks, alert policies (incl. api CPU/memory), log-based metrics
│   ├── billing-budget          # US$150/month budget with 50/90/100% + forecast emails
│   └── github-wif              # Workload Identity Federation for GitHub Actions
└── environments/
    ├── dev/                    # smallest tiers, scale-to-zero, no deletion protection
    ├── staging/                # prod topology, created on demand and destroyed afterwards
    └── prod/                   # low-cost first-year profile, always-on api, deletion protection
```

Each environment is an independent root module (own state, own GCP project) containing
`versions.tf`, `backend.tf` (partial GCS backend), `main.tf` (module composition, identical
in the three roots apart from the header comment), `variables.tf` (environment-specific
defaults), `outputs.tf`, `terraform.tfvars.example`. Every module ships `main.tf`,
`variables.tf` (validated, described), `outputs.tf`, `README.md`.

Provider versions: `hashicorp/google` and `hashicorp/google-beta` `~> 7.46`,
`hashicorp/random` `~> 3.6`, Terraform `>= 1.9`.

## The low-cost first-year profile (prod defaults, ADR 0016)

| Resource | Setting | Variable(s) |
| --- | --- | --- |
| Cloud SQL | PostgreSQL 17, **Enterprise** edition (explicit: PG16+ defaults to Enterprise Plus), `db-g1-small`, ZONAL, 10 GB SSD auto-resize, private IP, 7 daily backups, PITR 7 days, deletion protection | `sql_tier`, `sql_edition`, `sql_availability_type`, `sql_disk_size_gb`, `sql_retained_backups` |
| Connection pool | `DATABASE_POOL_SIZE=10` (max_connections 50 on db-g1-small; alert at 40) | `api_db_pool_size`, `sql_connection_alert_threshold` |
| Redis | **Valkey sidecar** in the api instance: `127.0.0.1 -::1` only, `save ''`, `appendonly no`, `maxmemory 200mb allkeys-lru`, 0.1 vCPU / 512Mi, image `valkey/valkey:8.1.10-alpine` pinned by digest through the Artifact Registry Docker Hub remote repository, TCP startup probe, api container `depends_on` it, `REDIS_URL=redis://localhost:6379` | `redis_mode`, `redis_sidecar_*` |
| api | 1 vCPU / 1Gi with the JVM heap capped at 50 % (`-XX:MaxRAMPercentage=50`; measured 2026-10-05 on the production image: 513 MiB RSS idle, 595 MiB under ~36 req/s, live heap ~100 MiB, ~390 MiB non-heap, JVM up in 33 s / readiness in 36 s at 1 vCPU), **min 1 / max 1** (enforced while `redis_mode = sidecar`), CPU always allocated, startup boost, session affinity, concurrency 80, Direct VPC egress `PRIVATE_RANGES_ONLY` | `api_cpu`, `api_memory`, `api_java_tool_options`, `api_min_instances`, `api_max_instances` |
| Card images | renditions are objects under `card-images/` of the media bucket (`STORAGE_PROVIDER=gcs`, ADR 0015 amendment 2026-10-05), the 5 GB cap is enforced from PostgreSQL, in-flight downloads use the in-memory disk (`CARD_IMAGE_CACHE_DIR=/tmp/card-images`) | `CARD_IMAGE_*` in `apps/api/src/main/resources/application.yml` |
| web | 1 vCPU / 512Mi, min 0 / max 2, every `config.json` value from Terraform (public values only) | `web_memory`, `web_min_instances`, `web_max_instances`, `firebase_web_*`, `google_maps_*` |
| Network | VPC + PSA peering + `/24` Direct VPC egress subnet; **no connector, no Cloud NAT** | `direct_vpc_subnet_cidr`, `enable_vpc_connector`, `enable_cloud_nat`, `api_vpc_egress` |
| Edge | global external ALB + Cloud Armor (Cloudflare ranges only) + **Certificate Manager with DNS authorization** (works behind the Cloudflare proxy); Origin CA fallback | `certificate_mode`, `origin_certificate`, `origin_certificate_secret_ids` |
| Scheduler | 10 jobs = every scheduled `/internal/jobs/*` route, called over the api's `run.app` URL (internal ingress) | module default `jobs` |
| Secrets | `db-password`, `service-token`, `location-jitter-secret`, `analytics-actor-salt`, `ads-token-secret`, `consent-ip-salt` generated by Terraform; `stripe-*` added by operators; no `redis-url` with the sidecar | — |
| ML | not instantiated (on hold) | `ml_enabled` |
| Guardrails | billing budget US$150 (owner applies it), Artifact Registry keeps ~10 images per service, api CPU/memory and Cloud SQL disk alerts | `billing_account_id`, `monthly_budget_usd`, `artifact_registry_keep_versions` |

Scale-up path, in order (all in `terraform.tfvars`, no code change): (1) `redis_mode =
"memorystore"` with `redis_tier = "BASIC"`, `redis_memory_size_gb = 1` and
`api_max_instances > 1` (lower `api_db_pool_size` so instances x pool stays under
max_connections); (2) `sql_tier = "db-custom-1-3840"` (first SLA-covered tier) then
`sql_availability_type = "REGIONAL"`; (3) `api_cpu = "2"`, `api_memory = "2Gi"`. The ML
path additionally needs `ml_enabled = true`, `enable_vpc_connector = true`,
`enable_cloud_nat = true`, `api_vpc_egress = "ALL_TRAFFIC"` (a validation enforces it).

## Workflow

```bash
cd infrastructure/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars        # git-ignored; fill in project id, repo, email, web config
terraform init \
  -backend-config="bucket=<PROJECT_ID>-tfstate" \
  -backend-config="prefix=environments/dev"
terraform fmt -recursive ../..                       # always before committing
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

Rules:

- `terraform fmt -check -recursive` and `terraform validate` for every environment run in CI
  (`.github/workflows/ci.yml`, job `terraform`) and locally with `npm run infra:validate`. A PR
  that changes `infrastructure/**` must pass them. There is no tflint configuration in the
  repository. `terraform plan` needs a real project and credentials and is never run by CI.
- `plan`/`apply` are run by an operator with `roles/owner` on the target project (or the
  deployer SA through `gcloud auth application-default login --impersonate-service-account`).
  CI does not apply infrastructure; it only deploys images.
- The main container image of a Cloud Run service is **not** managed by Terraform after the
  first apply (`lifecycle.ignore_changes = [template[0].containers[0].image]`). Deploys go
  through `.github/workflows/deploy.yml` (`gcloud run services update --container api`).
  Sidecar images are Terraform-managed and pinned by digest. Re-applying Terraform never
  rolls a deploy back.
- Never put secret values in `*.tfvars` (git-ignored anyway) except, deliberately, an Origin
  CA key when `certificate_mode = self_managed` (or point `origin_certificate_secret_ids` at
  Secret Manager instead). Terraform generates the application secrets listed above;
  operators add Stripe/Firebase values with `gcloud secrets versions add`
  (see `docs/deployment/README.md`).
- Destroying an environment: prod resources carry deletion protection at both the Terraform
  and API level; flipping `deletion_protection = false` requires a reviewed change.

## State

State is stored in a GCS bucket **per environment project**, created once by hand because
Terraform cannot bootstrap its own backend:

```bash
PROJECT_ID=orenjitrade-dev-123456
gcloud storage buckets create gs://${PROJECT_ID}-tfstate \
  --project "$PROJECT_ID" --location northamerica-northeast1 \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://${PROJECT_ID}-tfstate --versioning
```

Only operators and the `github-deployer` SA (read-only, for future plan-in-CI) may access it.
`backend.tf` deliberately contains a *partial* configuration (`prefix` only) so no bucket
name is committed; pass `bucket` at `init` time. State contains generated secrets
(`random_password`, including the location jitter secret) — treat the bucket as sensitive,
keep versioning on, never download state to a shared machine.

## Bootstrap order for a new project

1. Create the project, link billing, create the state bucket (above).
2. `terraform apply -target=module.project_services -target=module.service_accounts -target=module.github_wif -target=module.artifact_registry`
   so GitHub Actions can authenticate and push the first images.
3. Full `terraform apply`. Cloud Run starts with a placeholder image; the api revision only
   becomes ready once the Valkey sidecar's TCP probe passes and the api's readiness probe
   (db + redis) is green, which needs the real image and the secrets.
4. `terraform output certificate_dns_authorizations` and `load_balancer_ipv4`, then apply
   `infrastructure/cloudflare/terraform` (DNS-only `_acme-challenge` CNAMEs + proxied A
   records). The certificate moves to `ACTIVE` within minutes of the CNAMEs resolving.
5. Build images (`docker-build.yml`), deploy (`deploy.yml`), then follow
   `docs/deployment/README.md` for the remaining console steps and post-deploy checks.
6. Owner only: `billing_account_id = "..."` in tfvars and
   `terraform apply -target=module.billing_budget` (needs billing-account permissions).

## Temporary staging

Staging is **not** provisioned by default (it would cost roughly what prod costs). To rehearse
a release: create the staging project + state bucket, `terraform apply` in
`environments/staging` (deletion protection is off and the media bucket is force-destroyable
there), add the `staging` / `staging-api` A records and the staging `_acme-challenge` CNAMEs to
the Cloudflare tfvars, deploy with `deploy.yml` (environment `staging`), test, then remove the
Cloudflare records and `terraform destroy` the environment (Cloud SQL instance names cannot be
reused for about a week, so keep the `orenjitrade-staging` name or suffix it).

## How to add an environment

1. Copy `environments/staging` to `environments/<name>`.
2. Edit `variables.tf`: set the `environment` default and its validation, hostnames, sizing.
3. Edit `backend.tf` prefix to `environments/<name>`.
4. Add the directory to `.github/workflows/ci.yml` (terraform job matrix), to
   `scripts/infra-validate.mjs` and to `.github/dependabot.yml`.
5. Create the GCP project + state bucket, then follow the bootstrap order.
6. Add the environment to `docs/deployment/environments.md` and create the matching GitHub
   environment with reviewers.

## How to add a module

Create `modules/<name>/{main.tf,variables.tf,outputs.tf,README.md}`, validate every variable
(`validation` blocks), never hardcode project ids or regions, expose the identifiers other
modules need as outputs, and wire it into each environment's `main.tf` with
`depends_on = [module.project_services]` when it creates API-backed resources.
