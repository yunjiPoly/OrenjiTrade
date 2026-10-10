# Deploying OrenjiTrade to Google Cloud

End-to-end bootstrap of an environment (prod first; dev and staging are optional) from an empty
Google Cloud organisation to a live `www.orenjitrade.com`. Architecture:
`docs/architecture/ARCHITECTURE.md` section 10 and [ADR 0016](../architecture/adr/0016-low-cost-first-year-production-profile.md)
(low-cost first-year profile); infrastructure code: `infrastructure/terraform`; edge:
`infrastructure/cloudflare`.

Related documents: [environments.md](environments.md) (matrix), [runbooks.md](runbooks.md)
(operations), [backup-restore.md](backup-restore.md), [`docs/security/README.md`](../security/README.md).

Every value in the examples is fictional (`orenjitrade-prod-123456`, `example-org`). Nothing in
this document is applied by CI: an operator runs `terraform apply` by hand, never
`terraform apply` from a workflow, and never with service-account keys.

## 0. Prerequisites

- `gcloud` (>= 500), `terraform` (>= 1.9), `jq`, `curl`, Docker (for local checks only).
- A Google Cloud billing account (new accounts get **US$300 of credit for 90 days**; the budget
  below still counts list-price usage) and permission to create projects.
- The GitHub repository with Actions enabled and permission to create environments.
- Access to the Cloudflare account owning `orenjitrade.com` (Free plan is enough, ADR 0016).
- A Stripe account (test mode is enough until payments are switched on) and the Firebase console.

**Which environments to create.** Year one runs **prod only** (about US$131–142/month at list
prices, table below). `dev` is optional (≈ US$30/month idle at the Montreal rates of ADR 0016:
`db-f1-micro` 8.47 + 10 GB SSD 1.87, the load balancer's flat charge 18.25, six billed
scheduler jobs 0.60, scale-to-zero Cloud Run ≈ 0–1) and `staging` is created on demand and destroyed afterwards
(section 12). Without a dev project the images are built into the **prod** registry: point the
repository-level GitHub variables at prod in step 3.

## 1. Create the GCP project

```bash
export ENV=prod
export PROJECT_ID=orenjitrade-${ENV}-123456          # globally unique
export REGION=northamerica-northeast1
export BILLING_ACCOUNT=000000-AAAAAA-BBBBBB

gcloud projects create "$PROJECT_ID" --name "OrenjiTrade ${ENV}" --set-as-default
gcloud billing projects link "$PROJECT_ID" --billing-account "$BILLING_ACCOUNT"
# Terraform enables the rest; these are needed to run Terraform at all.
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
at `terraform init` (partial backend configuration) and never committed. The state holds the
generated secrets (database password, service token, salts): treat the bucket as sensitive.

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
| `GCP_PROJECT_ID` | repository | the project whose registry receives the images (**prod** when there is no dev project, otherwise dev) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | repository | output above (same project) |
| `GCP_DEPLOYER_SA` | repository | `github-deployer@<that project>.iam.gserviceaccount.com` |
| `GCP_IMAGE_REGISTRY` | repository | `northamerica-northeast1-docker.pkg.dev/<that project>/orenjitrade` |
| `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOYER_SA` | environment `staging` / `prod` | the staging / prod project values |
| `DEPLOY_ML` | environment, optional | unset: the ML service is never deployed (on hold) |

Create the GitHub **environment** `prod` (and `staging` when it exists) under Settings >
Environments with *Required reviewers* and deployment branches restricted to `main` and tags
`v*` ([environments.md](environments.md)). No service-account keys exist anywhere: GitHub
exchanges its OIDC token for short-lived credentials through the pool created above.
`wif_allowed_refs = ["refs/heads/main"]` in prod means `docker-build.yml` must be dispatched from
`main`.

When images are built into a **different** project's registry, add the consuming project's Cloud
Run service agent to that project's `artifact_registry_reader_members`:

```hcl
artifact_registry_reader_members = [
  "serviceAccount:service-<PROD_PROJECT_NUMBER>@serverless-robot-prod.iam.gserviceaccount.com",
]
```

## 4. Register the Firebase web app and fill the public web configuration

The web container renders `config.json` from environment variables that Terraform sets, so the
public Firebase web configuration must exist **before** the full apply (it can be added later
with a re-apply; the web app then has sign-in disabled until it is).

1. Firebase console > add the GCP project as a Firebase project (`firebase_project_id` defaults
   to the GCP project).
2. **Project settings > Your apps > Add app > Web**: copy `apiKey` → `firebase_web_api_key`,
   `appId` → `firebase_web_app_id`, `authDomain` → `firebase_auth_domain` (defaults to
   `<project>.firebaseapp.com`) into `terraform.tfvars`. These are public values (restricted by
   authorized domain), not secrets; the API key restriction is set in section 10.
3. There is no map key to set: the web map draws bundled Natural Earth boundaries and contacts
   no map provider (ADR 0017; the former `google_maps_*` variables are gone).

## 5. Apply the full environment

```bash
terraform plan -out tfplan
terraform apply tfplan
```

First apply takes 10–20 minutes (Cloud SQL and Service Networking dominate). It creates: the VPC
with the Private Service Access peering and the `/24` Direct VPC egress subnet (no connector, no
Cloud NAT), Cloud SQL `db-g1-small` ZONAL (Enterprise edition, private IP, 10 GB SSD, 7 backups,
PITR, deletion protection), the media bucket, Pub/Sub topics + DLQs + the BigQuery subscription,
the BigQuery dataset, Secret Manager secrets with generated versions (`db-password`,
`service-token`, `analytics-actor-salt`, `ads-token-secret`,
`consent-ip-salt`) and empty containers for the Stripe secrets, the `api` Cloud Run service (one
always-on instance running the placeholder image **plus the Valkey sidecar**, pulled through the
Artifact Registry Docker Hub remote repository), the `web` service (scale-to-zero), the global
HTTPS load balancer with Cloud Armor and a Certificate Manager certificate in state
`AUTHORIZING`, the ten Cloud Scheduler jobs, uptime checks and alert policies. No ML service.

Cloud Run services start with `us-docker.pkg.dev/cloudrun/container/hello`, which answers 200
on every path, so the placeholder revisions pass their probes and the apply completes; Terraform
ignores the main container image afterwards so CI deploys are never reverted (the sidecar image
stays Terraform-managed and pinned by digest).

```bash
terraform output load_balancer_ipv4
terraform output certificate_dns_authorizations     # one _acme-challenge CNAME per hostname
terraform output cloud_run_services                 # api: container "api", sidecars ["valkey"]
```

## 6. Cloudflare: DNS records, certificate authorization, rules

Apply `infrastructure/cloudflare/terraform` (or follow `infrastructure/cloudflare/README.md` by
hand) with the two outputs above in its `terraform.tfvars`:

1. `load_balancer_ipv4` → proxied `A` records `www` and `api` (plus the apex placeholder and its
   redirect rule).
2. `certificate_dns_authorizations` → `_acme-challenge.www` / `_acme-challenge.api` CNAMEs,
   **DNS only (grey cloud)**. A proxied CNAME is flattened to Cloudflare addresses and the
   certificate never validates.
3. Zone settings: SSL **Full (strict)**, Always Use HTTPS, HSTS, TLS 1.2 minimum, WebSockets on;
   the single Free-plan rate-limit rule, the cache rules (card images, placeholder images and
   media cacheable; everything else on `api.*` bypassed) and the WAF custom rules.

Then verify the certificate (minutes, not hours, once the CNAMEs resolve):

```bash
gcloud certificate-manager certificates describe "$(terraform output -json certificate | jq -r .name)" \
  --project "$PROJECT_ID" --format 'yaml(managed.state,managed.authorizationAttemptInfo)'
# managed.state: ACTIVE. While AUTHORIZING/PROVISIONING, Cloudflare in Full (strict) returns 526: expected.
dig +short CNAME _acme-challenge.api.orenjitrade.com     # must show <id>.authorize.certificatemanager.goog
```

`FAILED` with a CAA error means the zone has CAA records that do not allow `pki.goog`
(and `letsencrypt.org`); the zone has none by default. Fallback if DNS authorization cannot be
completed: a Cloudflare Origin CA certificate with `certificate_mode = "self_managed"`
(`infrastructure/terraform/modules/load-balancer/README.md`).

## 7. First image build and deploy

1. **Actions > Docker build > Run workflow** from `main`. The workflow authenticates through
   WIF, builds `api` and `web` (and `ml`, unused) and pushes
   `<registry>/orenjitrade/<service>:<sha>` and `:latest`.
2. **Actions > Deploy > Run workflow**, environment `prod`, the git sha from the build summary (or
   a `vX.Y.Z` tag); reviewers approve. The workflow updates the `api` container of the
   multi-container service (`gcloud run services update --container api --image ...`), deploys
   `web`, then smoke-tests readiness and `/api/v1/meta` through the public hostnames.
3. The first api revision runs the Flyway migrations and the start-up card image reconciliation
   (empty bucket: instant). Readiness needs the Valkey sidecar's TCP probe and the API's own
   `db` + `redis` checks; the startup probe allows 3 minutes.

Troubleshooting the first revision: `gcloud run revisions describe <revision> --region $REGION
--format 'yaml(status.conditions)'` and `gcloud logging read 'resource.type="cloud_run_revision"
severity>=ERROR' --limit 50`. A `Container failed to start` on the `valkey` container points at
the TCP probe vs. loopback question documented on `redis_sidecar_bind_address` (fallback
`"0.0.0.0"`; only the api container's port is exposed by Cloud Run).

## 8. Populate operator-managed secrets (when payments are switched on)

```bash
terraform output secrets_to_populate     # stripe-secret-key, stripe-webhook-secret, stripe-billing-webhook-secret [, firebase-service-account]

printf '%s' "$STRIPE_SECRET_KEY"     | gcloud secrets versions add stripe-secret-key     --data-file=- --project "$PROJECT_ID"
printf '%s' "$STRIPE_WEBHOOK_SECRET" | gcloud secrets versions add stripe-webhook-secret --data-file=- --project "$PROJECT_ID"
```

Use Stripe **restricted keys** (Connect + PaymentIntents + Transfers only). Only after the
versions exist set `stripe_secrets_enabled = true` (and, for subscriptions,
`billing_provider = "stripe"`, `stripe_price_premium`, a `stripe-billing-webhook-secret` version)
in `terraform.tfvars` and re-apply; the API then starts with `PAYMENT_PROVIDER=stripe` (still
behind the `protectedPayments` feature flag, ADR 0011). `firebase-service-account` is optional:
Cloud Run uses the Application Default Credentials of `api-run`, which already holds
`firebaseauth.admin`.

Never paste secret values into tfvars, issues, chat or logs (`docs/security/README.md`).

## 9. Configure Firebase / Identity Platform

In the Firebase console for the project:

1. **Authentication > Sign-in method**: enable **Email/Password** (with email verification),
   **Google** (OAuth client auto-created; add the support email) and **Apple** (Services ID,
   Team ID, Key ID, private key from the Apple developer account; required for iOS).
2. **Authentication > Settings > Authorized domains**: add `www.orenjitrade.com` (and
   `staging.orenjitrade.com` / `dev.orenjitrade.com` while those exist), keep `localhost`.
3. **Templates**: sender name `OrenjiTrade`, reply-to `no-reply@orenjitrade.com`, action URL
   `https://www.orenjitrade.com/auth/action`.
4. **Identity Platform** (upgrade the project): enable **MFA (TOTP + SMS)**; admin accounts are
   required to enrol (ADR 0008, `docs/security/README.md`).
5. **Project settings > Your apps**: the web app from section 4; register both mobile apps and
   copy their public config into `apps/mobile` `EXPO_PUBLIC_*` variables (public keys only,
   restricted by bundle id). The web app takes its values from Terraform (section 4), not from
   Angular environment files.
6. **Cloud Messaging**: enable FCM for push notifications; upload the APNs key.

## 10. Console safeguards the owner sets by hand

These are not in Terraform (API keys and quotas are managed in the console) and they are what
keeps a stolen key or a traffic spike from turning into a bill.

**No Google Maps key** (ADR 0017, 2026-10-08): the map is a vector map of bundled Natural Earth
boundaries, so there is no Maps JavaScript API key, quota or Map ID to manage. Do not enable the
Maps, Places or Geocoding APIs in the project.

**Firebase web API key** (same Credentials page, auto-created): add the **Websites** restriction
`https://www.orenjitrade.com/*`; if you add API restrictions, keep *Identity Toolkit API* and
*Token Service API* (Firebase Auth) on the list or sign-in breaks (from Firebase's key guidance;
check the console's suggestion list when editing).

**Billing budget**: set `billing_account_id` in the owner's `terraform.tfvars` only and run
`terraform apply -target=module.billing_budget` with the owner's own credentials (creating a
budget needs `roles/billing.costsManager` on the billing account, which the WIF deployer and
project operators must not get). US$150/month, emails at 50/90/100 % of actual spend and 100 % of
the forecast, credits excluded. A budget notifies; the hard limits are the sizing variables
(`api_max_instances = 1`, Cloud SQL tier), the Maps quota above and Cloudflare in front.

**Identity Platform SMS MFA**: in the Firebase console, **Authentication > Settings**, review the
SMS quota and region policy (allow only the regions you serve) so an enrolment loop cannot run up
SMS charges; admins are the only accounts required to enrol. (Console location from memory;
confirm it when setting it.)

**Cloud Armor**: keep the Standard tier. Adaptive Protection's full alerting needs Cloud Armor
Enterprise (a subscription far above this budget); the policy's layer-7 defence flag is harmless
in Standard, do not enable Enterprise.

## 11. Post-deploy checks

```bash
curl -fsS https://api.orenjitrade.com/actuator/health/readiness        # {"status":"UP"} incl. db + redis
curl -fsS https://api.orenjitrade.com/api/v1/meta | jq                  # environment "production"
curl -fsSI https://www.orenjitrade.com/ | grep -iE "^(HTTP|cf-cache-status|strict-transport)"
curl -fsS https://www.orenjitrade.com/config.json | jq                  # apiBaseUrl, wsBaseUrl wss://api..., firebase.apiKey set
gcloud scheduler jobs list --location "$REGION" --project "$PROJECT_ID"  # 9 jobs
gcloud scheduler jobs run orenjitrade-${ENV}-freshness --location "$REGION" --project "$PROJECT_ID"
gcloud logging read 'resource.type="cloud_run_revision" httpRequest.requestUrl:"/internal/jobs/" ' --limit 5 --project "$PROJECT_ID"   # 200, not 401
gcloud logging read 'resource.type="cloud_run_revision" severity>=ERROR' --limit 20 --project "$PROJECT_ID"
gcloud pubsub subscriptions describe analytics-events-bigquery --project "$PROJECT_ID" --format 'value(bigqueryConfig.state)'   # ACTIVE
bq query --use_legacy_sql=false "SELECT event_type, COUNT(*) c FROM \`${PROJECT_ID}.orenjitrade_analytics.events\` GROUP BY 1 ORDER BY c DESC LIMIT 10"
```

Then run the Cloudflare verification checklist (`infrastructure/cloudflare/README.md` section 12:
a public card image is `cf-cache-status: HIT` on the second request, API JSON never is), confirm
the uptime checks are green in Cloud Monitoring, trigger a test alert, and record the environment
in [environments.md](environments.md). Update `IMPLEMENTATION_STATUS.md` (acceptance criteria
42–44).

## 12. Temporary staging

Staging is **not** provisioned by default: it would cost about what prod costs (section 13),
pro-rated by the hour (a two-day rehearsal ≈ US$10 plus the Cloud SQL storage). To rehearse a
release:

1. Create the staging project and state bucket (sections 1–2), bootstrap (section 3) and
   `terraform apply` in `environments/staging` (deletion protection is off there; set
   `storage_force_destroy = true` in its tfvars, as the example does, so the teardown can delete
   the media bucket).
2. Add `staging` / `staging-api` to `additional_a_records` and the staging
   `certificate_dns_authorizations` to the Cloudflare tfvars, apply, wait for `ACTIVE`.
3. Deploy with `deploy.yml` (environment `staging`), test, run the restore drill if due
   ([backup-restore.md](backup-restore.md)).
4. Tear down: remove the Cloudflare records (apply), `terraform destroy` in
   `environments/staging`, delete the project if it is not needed again soon. Cloud SQL instance
   names cannot be reused for about a week after deletion: keep the `orenjitrade-staging` name
   for the next rehearsal or let Terraform suffix it.

## 13. Monthly cost (prod, Montreal, list prices, US$ before tax)

Read from the official pricing pages on 2026-10-05 (links and arithmetic in
[ADR 0016](../architecture/adr/0016-low-cost-first-year-production-profile.md)); 730 hours per
month. New accounts get US$300 of credit for 90 days.

| Line | Sizing | US$/month |
| --- | --- | --- |
| Cloud Run `api` (instance-based, always on) | 1 vCPU + 0.1 vCPU Valkey sidecar, 1 GiB + 512 MiB, min = max = 1 | ≈ 67 (72 before the free tier) |
| Cloud Run `web` (request-based) | min 0 / max 2, 1 vCPU / 512 MiB | ≈ 1 |
| Cloud SQL `db-g1-small` ZONAL, Enterprise | PostgreSQL 17, 10 GB SSD, 7 backups, PITR 7 d | ≈ 31 |
| Global external Application LB | 2 forwarding rules + ≈ 50 GiB processed | ≈ 19 |
| Cloud Armor Standard | 1 policy, 4 rules (Cloudflare IPv4 ×2, IPv6, default deny), per-request fee | ≈ 8–10 |
| Internet egress LB → Cloudflare | 30–100 GiB (images and assets cached at the edge) | ≈ 4–12 |
| Cloud Storage | media + card images ≤ 5 GB, ≈ 1 M reads | ≈ 1 |
| Artifact Registry | ≈ 10 versions × 2 images + the cached sidecar image | ≈ 0.3 |
| Secret Manager | 6 generated + up to 3 Stripe versions | ≈ 0.2 |
| Cloud Scheduler | 9 jobs (3 free) | 0.60 |
| Pub/Sub + BigQuery analytics | < 10 GiB/month | ≈ 0–0.5 |
| Certificate Manager, Direct VPC egress, LB addresses, Logging < 50 GiB, Monitoring, uptime checks, Firebase Auth < 50k MAU, Cloudflare Free | | 0 |
| **Total** | | **≈ 131–142** (≈ 125 at minimal traffic) |

Not included: the domain registration (Cloudflare Registrar, at cost), Stripe fees, SMS for MFA,
taxes (no map provider is billed: ADR 0017). The previous scale-sized topology was
≈ US$575–775/month.

## Ongoing operations

- Application deploys: `deploy.yml` only. Infrastructure changes: PR touching
  `infrastructure/**` (CI validates with `terraform fmt -check` + `validate`), then
  `terraform apply` by an operator.
- Rollback, scaling (the ADR 0016 scale-up path), secret rotation, restores, backlog drains, the
  Redis sidecar, budget alerts, incident checklist: [runbooks.md](runbooks.md).
- Backups and PITR: [backup-restore.md](backup-restore.md).
