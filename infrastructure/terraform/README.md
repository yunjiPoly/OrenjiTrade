# OrenjiTrade infrastructure (Terraform)

Google Cloud resources for every environment, composed from reusable modules. Cloudflare
(DNS, cache, WAF) lives next door in `infrastructure/cloudflare`. Architecture context:
`docs/architecture/ARCHITECTURE.md` section 10 and ADR 0003 (Cloud Run before GKE).

## Layout

```
infrastructure/terraform/
├── modules/                    # reusable building blocks, one directory each
│   ├── project-services        # enable APIs
│   ├── network                 # VPC, connector subnet, PSA peering, Serverless VPC connector, Cloud NAT
│   ├── cloud-sql               # PostgreSQL 17 (PostGIS via Flyway), private IP, backups + PITR
│   ├── redis                   # Memorystore (BASIC dev / STANDARD_HA prod)
│   ├── storage                 # media bucket (uniform access, CORS, tmp/ lifecycle)
│   ├── pubsub                  # topics + DLQs, push subscriptions (OIDC), BigQuery subscription
│   ├── bigquery                # orenjitrade_analytics.events (partitioned/clustered)
│   ├── artifact-registry       # docker repo `orenjitrade`
│   ├── secrets                 # Secret Manager containers + accessor IAM
│   ├── service-accounts        # api-run, web-run, ml-run, scheduler, pubsub-push, github-deployer
│   ├── cloud-run-service       # generic Cloud Run v2 service
│   ├── load-balancer           # global HTTPS LB, managed certs, redirect, Cloud Armor (Cloudflare only)
│   ├── scheduler               # freshness (hourly) + delist (daily) jobs
│   ├── monitoring              # uptime checks, alert policies, log-based metrics
│   └── github-wif              # Workload Identity Federation for GitHub Actions
└── environments/
    ├── dev/                    # smallest tiers, scale-to-zero, no HA, no deletion protection
    ├── staging/                # prod topology at small sizes, Cloudflare-only origin
    └── prod/                   # HA, min instances, deletion protection, Cloudflare-only origin
```

Each environment is an independent root module (own state, own GCP project) containing
`versions.tf`, `backend.tf` (partial GCS backend), `main.tf` (module composition),
`variables.tf` (environment-specific defaults), `outputs.tf`, `terraform.tfvars.example`.
Every module ships `main.tf`, `variables.tf` (validated, described), `outputs.tf`, `README.md`.

Provider versions: `hashicorp/google` and `hashicorp/google-beta` `~> 7.46`,
`hashicorp/random` `~> 3.6`, Terraform `>= 1.9`.

## Workflow

```bash
cd infrastructure/terraform/environments/dev
cp terraform.tfvars.example terraform.tfvars        # git-ignored; fill in project id, repo, email
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
  (`.github/workflows/ci.yml`, job `terraform`). A PR that changes `infrastructure/**` must pass
  them.
- `plan`/`apply` are run by an operator with `roles/owner` on the target project (or the
  deployer SA through `gcloud auth application-default login --impersonate-service-account`).
  CI does not apply infrastructure; it only deploys images.
- Cloud Run images are **not** managed by Terraform after the first apply
  (`lifecycle.ignore_changes = [template[0].containers[0].image]`). Deploys go through
  `.github/workflows/deploy.yml`. Re-applying Terraform never rolls a deploy back.
- Never put secret values in `*.tfvars` (git-ignored anyway). Terraform generates
  `db-password`, `redis-url` and `service-token`; operators add Stripe/Firebase values with
  `gcloud secrets versions add` (see `docs/deployment/README.md`).
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
(`random_password`) — treat the bucket as sensitive, keep versioning on, never download state
to a shared machine.

## Bootstrap order for a new project

1. Create the project, link billing, create the state bucket (above).
2. `terraform apply -target=module.project_services -target=module.service_accounts -target=module.github_wif`
   so GitHub Actions can authenticate and push the first images.
3. Full `terraform apply`. Cloud Run starts with a placeholder image.
4. Build images (`docker-build.yml`), deploy (`deploy.yml`), then follow
   `docs/deployment/README.md` for DNS, certificates and post-deploy checks.

## How to add an environment

1. Copy `environments/staging` to `environments/<name>`.
2. Edit `variables.tf`: set the `environment` default and its validation, hostnames, sizing.
3. Edit `backend.tf` prefix to `environments/<name>`.
4. Add the directory to `.github/workflows/ci.yml` (terraform job matrix) and to
   `.github/dependabot.yml`.
5. Create the GCP project + state bucket, then follow the bootstrap order.
6. Add the environment to `docs/deployment/environments.md` and create the matching GitHub
   environment with reviewers.

## How to add a module

Create `modules/<name>/{main.tf,variables.tf,outputs.tf,README.md}`, validate every variable
(`validation` blocks), never hardcode project ids or regions, expose the identifiers other
modules need as outputs, and wire it into each environment's `main.tf` with
`depends_on = [module.project_services]` when it creates API-backed resources.
