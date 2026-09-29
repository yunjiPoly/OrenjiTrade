# Deploying OrenjiTrade to Google Cloud

End-to-end bootstrap of an environment (dev, staging, prod) from an empty Google Cloud
organisation to a live `www.orenjitrade.com`. Architecture: `docs/architecture/ARCHITECTURE.md`
section 10; infrastructure code: `infrastructure/terraform`; edge: `infrastructure/cloudflare`.

Related documents: [environments.md](environments.md) (matrix), [runbooks.md](runbooks.md)
(operations), [backup-restore.md](backup-restore.md), [`docs/security/README.md`](../security/README.md).

Every value in the examples is fictional (`orenjitrade-prod-123456`, `example-org`).

## 0. Prerequisites

- `gcloud` (>= 500), `terraform` (>= 1.9), `jq`, `curl`, Docker (for local checks only).
- A Google Cloud billing account and permission to create projects.
- The GitHub repository with Actions enabled and permission to create environments.
- Access to the Cloudflare account owning `orenjitrade.com`.
- A Stripe account (test mode is enough for dev/staging) and the Firebase console.

Bootstrap is done **per environment**; do dev first, then staging, then prod.

## 1. Create the GCP project

```bash
export ENV=dev
export PROJECT_ID=orenjitrade-${ENV}-123456          # globally unique
export REGION=northamerica-northeast1
export BILLING_ACCOUNT=000000-AAAAAA-BBBBBB

gcloud projects create "$PROJECT_ID" --name "OrenjiTrade ${ENV}" --set-as-default
gcloud billing projects link "$PROJECT_ID" --billing-account "$BILLING_ACCOUNT"
# Terraform enables the rest; these two are needed to run Terraform at all.
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com iam.googleapis.com
```

Separate projects per environment give separate Cloud SQL instances, secrets, service
accounts and IAM boundaries (ARCHITECTURE.md section 10).

## 2. Create the Terraform state bucket (out-of-band)

```bash
gcloud storage buckets create "gs://${PROJECT_ID}-tfstate" \
  --project "$PROJECT_ID" --location "$REGION" \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://${PROJECT_ID}-tfstate" --versioning
```

Grant `roles/storage.objectAdmin` on it only to the operators group. The bucket name is passed
at `terraform init` (partial backend configuration) and never committed.

## 3. Bootstrap identities and Workload Identity Federation first

```bash
cd infrastructure/terraform/environments/$ENV
cp terraform.tfvars.example terraform.tfvars   # fill project_id, github_repository, alert_email
gcloud auth application-default login
terraform init -backend-config="bucket=${PROJECT_ID}-tfstate" -backend-config="prefix=environments/${ENV}"
terraform apply -target=module.project_services -target=module.service_accounts -target=module.github_wif -target=module.artifact_registry
terraform output github_workload_identity_provider
terraform output github_deployer_service_account
terraform output artifact_registry_url
```

In GitHub (**Settings > Secrets and variables > Actions > Variables**):

| Variable | Scope | Value |
| --- | --- | --- |
| `GCP_REGION` | repository | `northamerica-northeast1` |
| `GCP_PROJECT_ID` | repository | the **dev** project (images are built once into its registry) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | repository | output above (dev) |
| `GCP_DEPLOYER_SA` | repository | `github-deployer@<dev project>.iam.gserviceaccount.com` |
| `GCP_IMAGE_REGISTRY` | repository | `northamerica-northeast1-docker.pkg.dev/<dev project>/orenjitrade` |
| `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOYER_SA` | environment `staging` / `prod` | the staging / prod project values |

Create the GitHub **environments** `dev`, `staging`, `prod` (Settings > Environments). For
`staging` and `prod` enable *Required reviewers* (at least one maintainer other than the
requester) and restrict deployment branches to `main` and tags `v*`
([environments.md](environments.md)). No service-account keys exist anywhere: GitHub exchanges
its OIDC token for short-lived credentials through the pool created above.

Images built into the dev registry are pulled by staging/prod Cloud Run. After creating those
projects, add their Cloud Run service agents to dev's `artifact_registry_reader_members`:

```hcl
artifact_registry_reader_members = [
  "serviceAccount:service-<STAGING_PROJECT_NUMBER>@serverless-robot-prod.iam.gserviceaccount.com",
  "serviceAccount:service-<PROD_PROJECT_NUMBER>@serverless-robot-prod.iam.gserviceaccount.com",
]
```

## 4. Apply the full environment

```bash
terraform plan -out tfplan
terraform apply tfplan
```

First apply takes 15-25 minutes (Cloud SQL, Memorystore, Service Networking). It creates:
VPC + connector + NAT, Cloud SQL (private IP, PITR), Redis, media bucket, Pub/Sub topics +
DLQs + push/BigQuery subscriptions, BigQuery dataset, Secret Manager secrets (with generated
`db-password`, `redis-url`, `service-token` versions), three Cloud Run services running a
placeholder image, the global HTTPS load balancer with a managed certificate, Cloud Scheduler
jobs, uptime checks and alert policies.

Cloud Run services start with `us-docker.pkg.dev/cloudrun/container/hello`; Terraform ignores
the image afterwards so CI deploys are never reverted.

## 5. Populate operator-managed secrets

```bash
terraform output secrets_to_populate     # stripe-secret-key, stripe-webhook-secret [, firebase-service-account]

printf '%s' "$STRIPE_SECRET_KEY"     | gcloud secrets versions add stripe-secret-key     --data-file=- --project "$PROJECT_ID"
printf '%s' "$STRIPE_WEBHOOK_SECRET" | gcloud secrets versions add stripe-webhook-secret --data-file=- --project "$PROJECT_ID"
```

Use Stripe **restricted keys** (Connect + PaymentIntents + Transfers only), test mode outside
prod. Only after both versions exist set `stripe_secrets_enabled = true` in `terraform.tfvars`
and re-apply; the API then starts with `PAYMENT_PROVIDER=stripe` (still behind the
`protectedPayments` feature flag, ADR 0011). `firebase-service-account` is optional: Cloud Run
uses Application Default Credentials of `api-run`, which already holds `firebaseauth.admin`.

Never paste secret values into tfvars, issues, chat or logs (`docs/security/README.md`).

## 6. Configure Firebase / Identity Platform

In the Firebase console for the project (`firebase_project_id`, defaults to the GCP project):

1. **Authentication > Sign-in method**: enable **Email/Password** (with email verification),
   **Google** (OAuth client auto-created; add the support email) and **Apple** (Services ID,
   Team ID, Key ID, private key from the Apple developer account; required for iOS).
2. **Authentication > Settings > Authorized domains**: add `www.orenjitrade.com` (prod),
   `staging.orenjitrade.com`, `dev.orenjitrade.com`, keep `localhost`.
3. **Templates**: set the sender name `OrenjiTrade`, reply-to `no-reply@orenjitrade.com`, and
   the action URL to `https://www.orenjitrade.com/auth/action`.
4. **Identity Platform** (upgrade the project): enable **MFA (TOTP + SMS)**; admin accounts are
   required to enrol (ADR 0008, `docs/security/README.md`).
5. **Project settings > Your apps**: register the web app and both mobile apps; copy the
   public config into `apps/web-angular` environment files and `apps/mobile` `EXPO_PUBLIC_*`
   variables (public keys only, restricted by domain/bundle id).
6. **Cloud Messaging**: enable FCM for push notifications; upload the APNs key.

## 7. First image build and deploy

1. Merge to `main` (or run **Actions > Docker build > Run workflow**). The workflow
   authenticates through WIF, builds `api`, `web`, `ml` and pushes
   `<registry>/orenjitrade/<service>:<sha>` and `:latest`.
2. **Deploy** runs automatically for `dev` after a successful build. For staging/prod: **Actions
   > Deploy > Run workflow**, choose the environment and the image tag (the git sha shown in the
   Docker build summary or a `vX.Y.Z` tag); reviewers approve; `deploy-cloudrun` rolls out api,
   web and ml, then smoke-tests readiness and `/api/v1/meta`.
3. Flyway migrations run at API start; the first revision needs a couple of minutes on the
   smallest tier (startup probe allows 3 minutes).

## 8. Fetch the load balancer IP and create Cloudflare records

```bash
terraform output -raw load_balancer_ipv4
```

Follow `infrastructure/cloudflare/README.md` (or apply `infrastructure/cloudflare/terraform`):
proxied `A` records `www` and `api` (prod) / `dev`, `dev-api` / `staging`, `staging-api` pointing
at the IP, the apex redirect rule, SSL **Full (strict)**, cache bypass for `api.*` and
authenticated requests, WAF and rate limits.

## 9. Verify certificates

```bash
gcloud compute ssl-certificates describe "$(terraform output -json managed_certificate | jq -r .name)" \
  --global --project "$PROJECT_ID" --format 'yaml(managed.status,managed.domainStatus)'
```

Status moves `PROVISIONING` -> `ACTIVE` within ~15-60 minutes once both hostnames resolve to
the LB through Cloudflare. `FAILED_NOT_VISIBLE` means DNS is not pointing at the LB yet. Until
`ACTIVE`, Cloudflare in Full (strict) mode returns **526**; that is expected. With
`restrict_to_cloudflare = true`, Google's domain validation still works because it goes through
Cloudflare to the LB.

## 10. Post-deploy checks

```bash
curl -fsS https://api.orenjitrade.com/actuator/health/readiness
curl -fsS https://api.orenjitrade.com/api/v1/meta | jq
curl -fsSI https://www.orenjitrade.com/ | grep -iE "^(HTTP|cf-cache-status|strict-transport)"
gcloud scheduler jobs run orenjitrade-${ENV}-freshness --location "$REGION" --project "$PROJECT_ID"
gcloud logging read 'resource.type="cloud_run_revision" severity>=ERROR' --limit 20 --project "$PROJECT_ID"
gcloud pubsub subscriptions describe analytics-events-bigquery --project "$PROJECT_ID" --format 'value(bigqueryConfig.state)'   # ACTIVE
bq query --use_legacy_sql=false "SELECT event_type, COUNT(*) c FROM \`${PROJECT_ID}.orenjitrade_analytics.events\` GROUP BY 1 ORDER BY c DESC LIMIT 10"
```

Then run the Cloudflare verification checklist, confirm the uptime checks are green in Cloud
Monitoring, trigger a test alert (pause the api service for a minute in dev) and record the
environment in [environments.md](environments.md). Update `IMPLEMENTATION_STATUS.md`
(acceptance criteria 42-44).

## Ongoing operations

- Application deploys: `deploy.yml` only. Infrastructure changes: PR touching
  `infrastructure/**` (CI validates), then `terraform apply` by an operator.
- Rollback, scaling, secret rotation, restores, backlog drains, incident checklist:
  [runbooks.md](runbooks.md).
- Backups and PITR: [backup-restore.md](backup-restore.md).
