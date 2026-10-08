# ADR 0016 — Low-cost first-year production profile

**Status:** Accepted · **Date:** 2026-10-05 · Refines [ADR 0003](0003-cloud-run-before-gke.md)
(Cloud Run), [ADR 0009](0009-domain-events-outbox-pubsub.md) (events), [ADR 0013](0013-google-client-libraries-not-spring-cloud-gcp.md)
(client libraries) and [ADR 0015](0015-card-images-provider-hosting-capped-cache.md) (card images,
amendment 2026-10-05). Nothing here is deployed: it is the configuration the owner applies later
(`docs/deployment/README.md`). Prices are list prices for Montreal (`northamerica-northeast1`),
US$ before tax, read from the official pricing pages on 2026-10-05 (links in the cost table).

## Context

The first production topology (`infrastructure/terraform/environments/prod` before this ADR) was
sized for scale: Cloud SQL `db-custom-2-7680` REGIONAL (HA), Memorystore STANDARD_HA 5 GB with a
replica, the API at 2 vCPU / 2 GiB always on with up to 20 instances, the web service always on,
a Serverless VPC Access connector plus Cloud NAT that only the paused ML service needed. At list
prices that is roughly US$575–775/month before a single user signs up.

Year one has a few hundred to a few thousand users. The owner's target is about US$115–130/month
at list prices, with **reliability over the last dollar**: no design that silently loses user data
or stops background work. New Google Cloud accounts get US$300 of credit for 90 days
([free-cloud-features](https://docs.cloud.google.com/free/docs/free-cloud-features): "You will not
be billed for any Google Cloud usage during your Free Trial").

Several go-live blockers existed independently of cost: the Spring profile mapping was wrong
(`production` instead of `prod`), four start-up secrets were never provided, the web container
received only `API_BASE_URL`, the Google-managed certificate could not be issued behind the
Cloudflare proxy, three Cloudflare rate-limit rules exceeded the Free plan, the card image cache
lived on Cloud Run's ephemeral disk, Cloud Scheduler knew two of ten scheduled jobs, and the
Cloud Scheduler OIDC calls would have been rejected (`INTERNAL_AUDIENCE` / `INTERNAL_INVOKERS`
missing).

## Decision

Everything below is the **default of the prod root module**; the larger topology remains
reachable through variables (`terraform.tfvars`), see "Scale-up path".

### 1. Database — Cloud SQL `db-g1-small`, ZONAL, Enterprise edition

PostgreSQL 17, `settings.edition = "ENTERPRISE"` **set explicitly** because for PostgreSQL 16 and
later the default edition is Enterprise Plus, which has no shared-core machine types
([editions-intro](https://docs.cloud.google.com/sql/docs/postgres/editions-intro)). `db-g1-small`
(shared vCPU, 1.7 GB), ZONAL, 10 GB SSD with automatic storage increase, private IP only (as
before), automated daily backups with 7 retained, point-in-time recovery with 7 days of
transaction logs (the Enterprise maximum), deletion protection at both the Terraform and the API
level ([instance-settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings),
[configure-pitr](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/configure-pitr)).

PostGIS 3.5 and `pg_trgm` 1.6 are supported on every PostgreSQL 17 instance regardless of machine
type or edition ([extensions](https://docs.cloud.google.com/sql/docs/postgres/extensions)); Flyway
`V001` creates them. The default `max_connections` for a 1.7 GB instance is **50**
([flags](https://docs.cloud.google.com/sql/docs/postgres/flags), `max_connections` table), so the
prod profile's `DATABASE_POOL_SIZE` went from 20 to **10** (Flyway shares the HikariCP pool):
10 + `superuser_reserved_connections` (3) + Cloud SQL's own sessions + `psql` headroom stays far
below 50; the connection alert fires at 40.

**Caveat, accepted for year one:** `db-f1-micro` and `db-g1-small` are "not included in the
Cloud SQL SLA" and are described as test/development tiers
([instance-settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings)). The data
is protected (daily backups, PITR, deletion protection, soft-deleted media); availability is not
contractually guaranteed. `db-custom-1-3840` (1 vCPU, 3.75 GB, ≈ US$54/month) is the first
SLA-covered step.

### 2. Redis without Memorystore — a Valkey sidecar in the API instance

A Cloud Run instance may run up to 10 containers including the ingress one (so up to nine
sidecars); they share the instance's network namespace and talk over `localhost`, and only
the ingress container exposes a port
([deploying#sidecars](https://docs.cloud.google.com/run/docs/deploying#sidecars),
[containers](https://docs.cloud.google.com/run/docs/configuring/services/containers)). The api
service therefore carries a second container:

| Setting | Value |
| --- | --- |
| Image | `valkey/valkey:8.1.10-alpine` (BSD-3-Clause; Redis 7-compatible with Lettuce / Spring Data Redis), pinned by manifest digest, pulled through an Artifact Registry **remote repository** that caches Docker Hub ([remote-repo](https://docs.cloud.google.com/artifact-registry/docs/repositories/remote-repo)) — never `:latest`, never a Docker Hub pull at deploy time |
| Command | `valkey-server --bind 127.0.0.1 -::1 --port 6379 --protected-mode yes --save '' --appendonly no --maxmemory 200mb --maxmemory-policy allkeys-lru`, run as the `valkey` user through `setpriv` |
| Resources | 0.1 vCPU / 512 MiB (512 MiB is the gen2 per-container minimum; `maxmemory` 200 MB) |
| Start order | the api container `depends_on` the sidecar; the sidecar has a TCP startup probe on 6379; the api keeps `redis` in its readiness health group, so the instance is never routed to without its cache ([healthchecks](https://docs.cloud.google.com/run/docs/configuring/healthchecks)) |
| API config | `REDIS_URL=redis://localhost:6379` as plain environment (the `redis-url` secret only exists with `redis_mode = memorystore`) |

This is acceptable only because **Redis is never primary storage** (CLAUDE.md). Every Redis
user was inspected (`auth/ratelimit/RedisRateLimiter`, `common/cache/RedisJsonCache` and its
callers, `search/infra/DiscoveryCache` (the former `NearbyCache`, ADR 0017), `messaging/infra/PresenceStore`,
`RedisRealtimePublisher` + `RealtimeConfig`, `users/infra/LastActiveThrottle`,
`binders/infra/BinderViewTracker`, `credits/infra/CreditBalanceCache`, `billing/domain/Limits`,
the `Idempotency-Key` stores of `offers/domain/OfferService` and
`reports/domain/CollectorReportService`). All of them fail open or fall back to the database.
Domain events use the Spring Modulith JDBC outbox (`event_publication`), not Redis.

**What is lost when the sidecar restarts empty** (it restarts with the instance: deploy, crash,
Cloud Run maintenance; there is no persistence by design):

| Redis user | Keys | Effect of an empty restart |
| --- | --- | --- |
| Rate limiting (`rl:*`, fixed windows ≤ 24 h) | counters | every client gets one fresh window (at most `limit` extra requests once); the limiter also fails open while Redis is unreachable, Cloudflare's edge rule stays the outer guard |
| Rule caches (`orenji:cache:*`, 60 s): feature flags, plans, entitlements, games, credit products/settings, delist policy, donation/payment settings, the regions catalogue; discovery pages + generation counter | warm cache | one database read per key; the discovery generation counter restarts at 0 together with the pages it versioned, so results stay consistent (ADR 0014: the tables are the truth) |
| Usage limits mirror (`orenji:usage:*`, ≤ 10 min) | mirror of `usage_counter` | nothing: rebuilt from the table on the next check |
| Credit balance cache (`orenji:credits:balance:*`, 10 min) | cache of the ledger | nothing: spends always sum the ledger under its lock; `credits-reconcile` repairs |
| Presence (`presence:<user>`, 60 s) | online markers | everyone appears offline for at most 60 s until the next heartbeat |
| Realtime fan-out (pub/sub `rt:user:*`) | in-flight messages only | nothing durable: the single instance delivers to its own WebSocket sessions when Redis is unavailable; payloads are derived from database rows |
| Last-active throttle (`user:last-active:*`, 5 min) | SET NX marker | one extra `last_active_at` write per active user |
| Binder view de-duplication (`orenji:binder-view:*`, until midnight UTC) | SET NX marker | a binder re-opened after the restart counts again that day (metric + the plan's daily `binder.views.per_day` allowance charged twice); minor |
| `Idempotency-Key` replay protection (`idem:offer:*`, `idem:report:*`, 24 h) | key → id | **the only user-visible loss**: a client that retries `POST /offers` or `POST /reports` with the same key after a restart creates a duplicate (already listed as backend debt: "Idempotency-Key replay fail-open without Redis"; a database unique column would remove it) |

Memory need is a few hundred small strings per active user; 200 MB with `allkeys-lru` is ample.

### 3. API — exactly one Cloud Run instance, CPU always allocated

`min_instances = max_instances = 1` (a validation refuses `max > 1` while `redis_mode =
sidecar`): a localhost cache cannot fan out realtime events or share rate-limit windows between
instances. `cpu_idle = false` (instance-based billing, CPU for the whole instance lifetime:
outbox workers, WebSocket fan-out, scheduled retries and the sidecar all need it;
[billing-settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)),
startup CPU boost and session affinity kept
([cpu](https://docs.cloud.google.com/run/docs/configuring/services/cpu),
[session-affinity](https://docs.cloud.google.com/run/docs/configuring/session-affinity)),
concurrency 80, request timeout 3600 s (WebSockets), Direct VPC egress (below).

Sizing: **1 vCPU / 1 GiB** for the api container (plus the sidecar's 0.1 vCPU / 512 MiB), with
the JVM heap capped at 50 % (`JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=50 -XX:+UseG1GC`). Measured
locally on 2026-10-05 (Docker `--cpus=1 --memory=1g`, the production image with the `prod`
profile; nothing was deployed, this is not a cloud measurement): JVM started in 33.1 s, readiness after 35.7 s; 513 MiB RSS idle; 595 MiB RSS (588 MiB cgroup peak)
under about 36 requests/s of mixed public and authenticated load (8,700 requests, all 200); live
heap after GC ≤ 108 MiB, committed heap ≤ 209 MiB, so about 390 MiB is non-heap (metaspace, code
cache, threads, Netty/gRPC buffers). A 75 % heap cap (768 MiB) plus 390 MiB non-heap could exceed
the container and be killed by the kernel instead of ending in the logged `OutOfMemoryError` the
Dockerfile asks for; 512 MiB is five times the live heap. The startup probe (36 × 5 s) covers the
measured start-up with margin, and Cloud Run's startup boost shortens it. Raise `api_memory` to
1.5Gi/2Gi when the memory-utilisation alert (85 %) fires; keep the 50 % share.

Consequences of a single instance: a deploy is still zero-downtime (Cloud Run starts the new
revision beside the old one and switches traffic once it is ready), but during that overlap a
realtime message published on one instance for a WebSocket session held by the other is only
delivered locally; clients reconnect and reload from the database (messages and notifications
are persisted). A crash means the start-up time (≈ 40–60 s) without the API. Throughput of one
1 vCPU instance (tens of requests per second sustained) is far above what a few thousand users
generate.

### 4. Networking — Direct VPC egress, no connector, no Cloud NAT

The api reaches Cloud SQL's private IP through Direct VPC egress with `PRIVATE_RANGES_ONLY`; the
calls to Firebase, Stripe and YGOPRODeck leave Cloud Run directly. Direct VPC egress has no
compute charge (a connector bills its VMs) and needs a subnet of `/26` or larger
([vpc-direct-vpc](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)); the network
module creates a `/24`. The Serverless VPC Access connector and Cloud NAT stay in the module
behind `enable_vpc_connector` / `enable_cloud_nat` and are instantiated only with the ML service
(`ml_enabled = true` requires both and `ALL_TRAFFIC` egress; a validation enforces it). ML
remains on hold (CLAUDE.md): the prod root creates no ML service, no push subscription for
`card-scan-requests`, no bucket viewer binding.

### 5. Web — nginx on Cloud Run, scaled to zero

`min 0 / max 2`, 1 vCPU / 512 MiB (the gen2 minimum), request-based billing, concurrency 200.
Every runtime value `apps/web-angular/docker-entrypoint.sh` renders into `config.json` and the
nginx CSP is wired in Terraform: `API_BASE_URL`, `WS_BASE_URL` (`wss://api.<host>/ws`),
`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`,
`FIREBASE_AUTH_EMULATOR_HOST` (empty), `ENVIRONMENT`. All are public values (Firebase web config
restricted by authorized domain); no secret may appear there (CLAUDE.md). (Amended 2026-10-08:
`GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_MAP_ID` are gone with the map provider, ADR 0017.)

### 6. Edge and TLS — Cloudflare Full (strict) in front of a Certificate Manager certificate

The global external Application Load Balancer and the Cloudflare-only Cloud Armor policy stay
(cheap protection against bypassing Cloudflare). The classic `google_compute_managed_ssl_certificate`
cannot be issued while Cloudflare proxies the hostnames (Google validates over HTTP through the
public name and never reaches the LB). The load-balancer module therefore defaults to
**Certificate Manager with DNS authorization**: one `_acme-challenge.<host>` CNAME per hostname,
created **DNS-only** in Cloudflare by `infrastructure/cloudflare/terraform`
(`certificate_dns_authorizations` output of the environment), a certificate map attached to the
HTTPS proxy; the `www`/`api` records stay proxied the whole time
([dns-authorizations](https://docs.cloud.google.com/certificate-manager/docs/dns-authorizations),
[deploy-google-managed-dns-auth](https://docs.cloud.google.com/certificate-manager/docs/deploy-google-managed-dns-auth);
first 100 certificates per month are free,
[certificate-manager/pricing](https://cloud.google.com/certificate-manager/pricing)). Fallback:
a Cloudflare Origin CA certificate (`certificate_mode = self_managed`) whose key comes from the
git-ignored tfvars or from Secret Manager, never from the repository
([origin-ca](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/)). Cloudflare
SSL mode is **Full (strict)**, which accepts both
([full-strict](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)).
If CAA records are ever added to the zone they must allow `pki.goog` (and `letsencrypt.org`).

### 7. Cloudflare Free plan

Checked on 2026-10-05 ([rate-limiting-rules](https://developers.cloudflare.com/waf/rate-limiting-rules/),
[custom-rules](https://developers.cloudflare.com/waf/custom-rules/),
[cache-rules](https://developers.cloudflare.com/cache/how-to/cache-rules/)): Free allows **one**
rate-limiting rule with a fixed 10 s period and mitigation, IP characteristics and path-only
expressions; 5 custom WAF rules; 10 cache rules. The former `auth` (20/10 s), `messaging`
(POST, 20/10 s) and `search` (60/10 s) rules became one rule over the union of their path
prefixes at 60 requests per 10 s per IP. **Dropped at the edge:** the tighter per-group
thresholds, the POST-only condition on messaging and the host scoping; all of them are still
enforced by the API's Redis fixed windows (`orenji.ratelimit`, 60/min anonymous per IP, 120/min
per user, per-route policies). Public image routes are excluded from the edge rule on purpose (a
page loads dozens of card images).

Caching: Cloudflare does not cache extension-less or JSON responses by default, so a cache rule
makes `/api/v1/public/card-images/*`, `/api/v1/public/placeholder-images/*` and
`/api/v1/public/media/*` cache-eligible honouring the origin's `Cache-Control`; the code sends
`public, max-age=31536000, immutable` (+ ETag) for cached artwork and media, `public,
max-age=300` for placeholders and provider redirects, `public, max-age=86400` for placeholder
SVGs. Everything else on `api.*` bypasses the cache and is uncacheable anyway: Spring Security's
default `Cache-Control: no-cache, no-store, max-age=0, must-revalidate` on every other response,
`no-store` on Problem Details ([cache-control concepts](https://developers.cloudflare.com/cache/concepts/cache-control/):
`no-store`/`private` and `Set-Cookie` responses are never cached). Hashed web assets
(`public, max-age=31536000, immutable` from nginx) are cached; `index.html` and `config.json`
(`no-cache, no-store, must-revalidate`) are not.

### 8. Scheduled jobs — every scheduled `/internal/jobs/*` route

Cloud Scheduler calls the api's `run.app` URL (same-project Cloud Scheduler counts as internal
ingress, so Cloud Run IAM is enforced and no Cloudflare/LB hop is involved) with an OIDC token
whose audience is the public API URL (a `custom_audiences` entry of the service and the API's
`INTERNAL_AUDIENCE`; `INTERNAL_INVOKERS` lists the scheduler and pubsub-push service accounts).
Schedules come from the controllers' documentation, `docs/api/contracts` and the `local` profile's
`@Scheduled` cadences, minutes staggered:

| Job | Schedule (UTC) | Source |
| --- | --- | --- |
| `freshness` | `15 * * * *` | hourly (`FreshnessJobController`, phase 3 contract) |
| `delist` | `30 5 * * *` | nightly (`DelistJobController`) |
| `account-deletion` | `20 * * * *` | hourly, 7-day grace (`AccountDeletionJobController`) |
| `offers-expire` | `5 * * * *` | hourly (`OfferJobController`, phase 8 contract) |
| `payments-auto-release` | `25 * * * *` | hourly (`PaymentJobController`; no-op while `payments.auto_release_enabled` is off) |
| `credits-reconcile` | `35 * * * *` | hourly (`CreditJobController`) |
| `subscriptions-period` | `40 * * * *` | hourly (`BillingJobController`) |
| `upload-cleanup` | `2/15 * * * *` | every 15 minutes (`UploadCleanupJobController`) |
| `wishlist-rematch` | `0 5 * * *` | nightly (`WishlistJobController`, phase 6 contract) |
| `card-images-reconcile` | `45 4 * * *` | no documented cadence; daily chosen (idempotent, also runs at API start-up) |

Excluded on purpose, and refused by a module validation: `POST /internal/jobs/ping` (probe),
`POST`/`GET /internal/jobs/catalog-import` (explicit real-provider import, `npm run
catalog:import`), `GET /internal/jobs/card-images/status`, `POST /internal/jobs/card-images/clear`
(destructive). The first 3 jobs per billing account are free, then US$0.10 per job and month
([scheduler/pricing](https://cloud.google.com/scheduler/pricing)).

### 9. Spring profile mapping

`SPRING_PROFILES_ACTIVE = var.environment` (`dev` | `staging` | `prod`, the `on-profile` documents
of `application.yml`); `ORENJI_ENV` keeps `development` | `staging` | `production`
(`orenji.environment`, shown by `GET /api/v1/meta`). With the old `production` value no profile
document applied: the pool size, ECS logging and the missing default service token would have
silently stayed at their base values.

### 10. Secrets and environment

Generated by Terraform and stored in Secret Manager (never in tfvars): `db-password`,
`service-token`, `analytics-actor-salt`, `ads-token-secret`, `consent-ip-salt` (amended
2026-10-08: `location-jitter-secret` is gone with the coordinates, ADR 0017). The API refuses to
start outside `local`/`test` without the first four (`ServiceTokenStartupValidator`,
`AnalyticsConfig`, `AdsConfig`). Added by an
operator: `stripe-secret-key`, `stripe-webhook-secret`, `stripe-billing-webhook-secret`, optional
`firebase-service-account`. Gone: the `redis-url` secret (fixed `redis://localhost:6379`), and
environment variables no code reads (`TRUSTED_PROXY_HEADER`, `INTERNAL_JOBS_INVOKER_EMAIL`,
`PUBSUB_PUSH_INVOKER_EMAIL`, `FCM_PROJECT_ID`, `PUBSUB_TOPIC_CARD_SCAN_REQUESTS`, `ML_SERVICE_*`
unless ML is enabled). Added: `INTERNAL_AUDIENCE`, `INTERNAL_INVOKERS`, `BILLING_PROVIDER`,
`ADS_WEB_BASE_URL`, `CARD_IMAGE_CACHE_DIR=/tmp/card-images`, and
`STORAGE_PUBLIC_BASE_URL=https://api.<host>/api/v1/public/media` because the media bucket
enforces public access prevention (the default `storage.googleapis.com` URL would answer 403 for
avatars and photos). The `domain-events` push subscription is off (`pubsub_domain_events_push_enabled
= false`) until the API implements `/internal/events/pubsub` (ADR 0009 adapter); it would only
dead-letter and trip the backlog alert.

### 11. Card images on object storage

See the ADR 0015 amendment of 2026-10-05: the renditions live behind a dedicated `ObjectStorage`
instance — local files locally (unchanged behaviour), the `card-images/` prefix of the media
bucket in the cloud — with the 5 GB cap still counting stored objects, temporary files and
reservations, provider URLs server-side, no hotlinking, the 5 requests/second pacing, and a
start-up reconciliation that lists the bucket, repairs rows and never deletes an unreferenced
object younger than the reservation TTL.

### 12. Cost guardrails

- `google_billing_budget` of **US$150/month** on the billing account, scoped to the prod project,
  emails at 50 %, 90 % and 100 % of the actual spend and at 100 % of the forecast, credits
  excluded so alerts reflect list-price usage during the trial. The resource needs billing-account
  permissions the WIF deployer does not hold, so it is created only when `billing_account_id` is
  set (the owner applies `-target=module.billing_budget` once).
- Artifact Registry cleanup keeps the 10 most recent versions of each image (api, web) plus every
  `v*` tag; older tagged versions go after 30 days, untagged after 14
  ([cleanup-policy](https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)).
- Staging is not provisioned by default; `docs/deployment/README.md` documents the temporary
  bring-up and teardown.
- Monitoring gained api CPU (80 %) and memory (85 %) utilisation alerts and a Cloud SQL disk
  alert; the connection alert threshold is 40.

### 13. Kept

Firebase Authentication / Identity Platform, the Pub/Sub + BigQuery analytics transport, Secret
Manager, Cloud Logging/Monitoring alerts, uptime checks, the GitHub Actions deploy through
Workload Identity Federation (now `gcloud run services update --container api` because the service
has two containers), Cloud Armor, HSTS, the admin MFA rule.

## Cost table (Montreal, list prices, US$/month, 730 h, before tax)

| Line | Sizing | Estimate | Basis |
| --- | --- | --- | --- |
| Cloud Run api (instance-based) | 1 vCPU + 0.1 vCPU sidecar, 1 GiB + 512 MiB, min = max = 1 | **≈ 67** | Tier 2 region: $0.0000216/vCPU-s × 1.1 vCPU × 2,628,000 s = 62.44; $0.0000024/GiB-s × 1.5 GiB × 2,628,000 s = 9.46; minus the free tier (240,000 vCPU-s + 450,000 GiB-s at Tier 1 rates ≈ 5.2) — [run/pricing](https://cloud.google.com/run/pricing) |
| Cloud Run web (request-based) | min 0 / max 2, 1 vCPU / 512 MiB | **≈ 1** | $0.0000336/vCPU-s active, $0.0000035/GiB-s, $0.40 per million requests; Cloudflare serves the hashed assets; 2 M requests + 180,000 vCPU-s free — [run/pricing](https://cloud.google.com/run/pricing) |
| Cloud SQL `db-g1-small` ZONAL (Enterprise) | PostgreSQL 17, 10 GB SSD, 7 backups, PITR 7 d | **≈ 31** | $0.0385/h = 28.11; SSD $0.187/GiB-month × 10 = 1.87; backups $0.088/GiB-month × a few incremental GiB ≈ 0.5; PITR logs ≤ 1 (safety margin) — [sql/pricing](https://cloud.google.com/sql/pricing) |
| Global external Application LB | 2 forwarding rules (443, 80; the first 5 are one flat charge), ≈ 50 GiB processed | **≈ 19** | $0.025/h = 18.25 + $0.009/GiB in and out ≈ 0.9 (Montreal selected in the region picker; the page's default view shows $0.008/GiB) — [load-balancing/pricing](https://cloud.google.com/load-balancing/pricing), Montreal table in [vpc/network-pricing](https://cloud.google.com/vpc/network-pricing) |
| Cloud Armor Standard | 1 policy, 4 rules (Cloudflare IPv4 ×2, IPv6, default deny) + requests | **≈ 8–10** | policy $0.006849315/h ≈ 5.00; rule $0.001369863/h ≈ 1.00 each (the page does not say whether the default rule is billed); $0.75 per million requests — [armor/pricing](https://cloud.google.com/armor/pricing) |
| Internet egress (LB → Cloudflare) | 30–100 GiB (JSON; images and assets are cached at the edge) | **≈ 4–12** | $0.12/GiB (Premium tier, 0–1 TiB, North America); Cloud Run's 1 GiB free — [vpc/network-pricing](https://cloud.google.com/vpc/network-pricing) |
| Cloud Storage (media + card images ≤ 5 GB) | 5–8 GiB Standard, ≈ 1 M Class B ops | **≈ 1** | $0.023/GiB-month; Class A $0.005/1k, Class B $0.0004/1k; no Always Free in Montreal — [storage/pricing](https://cloud.google.com/storage/pricing) |
| Artifact Registry | ≈ 2–4 GB after cleanup (+ the cached Valkey image) | **≈ 0.3** | 0.5 GB free, then $0.10/GiB-month — [artifact-registry/pricing](https://cloud.google.com/artifact-registry/pricing) |
| Secret Manager | 6 generated + up to 3 Stripe versions; reads at instance start only | **≈ 0.2** | 6 active versions and 10,000 accesses free, then $0.06/version-month — [secret-manager/pricing](https://cloud.google.com/secret-manager/pricing) |
| Cloud Scheduler | 10 jobs | **0.70** | 3 free, then $0.10/job-month — [scheduler/pricing](https://cloud.google.com/scheduler/pricing) |
| Pub/Sub + BigQuery (analytics) | well under 10 GiB/month | **≈ 0–0.5** | the 10 GiB/month free tier covers basic message delivery only, not BigQuery-subscription throughput ($50/TiB, so 10 GiB ≈ 0.49); BigQuery's 10 GiB of storage and 1 TiB of queries are free — [pubsub/pricing](https://cloud.google.com/pubsub/pricing), [bigquery/pricing](https://cloud.google.com/bigquery/pricing) |
| Certificate Manager, Direct VPC egress, LB addresses, Cloud Logging (< 50 GiB), Monitoring, uptime checks, Firebase Auth (< 50k MAU), Cloudflare Free | | **0** | 100 certificates/month free; no compute for Direct VPC egress; [free-cloud-features](https://docs.cloud.google.com/free/docs/free-cloud-features) |
| **Total** | | **≈ 131–142** (≈ 125 at minimal traffic) | |

The total is the sum of the lines (66.7 + 1 + 31 + 19 + 8–10 + 3.6–12 + 1 + 0.3 + 0.2 + 0.7 +
0–0.5 = 131.5–142.4); the minimal-traffic figure drops the web, egress and analytics lines to
≈ 0.5 in all and keeps Cloud Armor at 8. The US$115–130 target is met only at low egress: Montreal is a Cloud Run **Tier 2** region
(20 % above Tier 1) and has no Cloud Storage Always Free allowance. The remaining levers, in
order of what they cost in reliability: Cloud Armor (≈ 8–10, the owner chose to keep it),
Cloud SQL `db-f1-micro` for a very quiet soft launch (0.6 GB, `max_connections` 25, ≈ 8.47
instead of 28.11), a 1-year Cloud Run committed-use discount once the shape is stable (17 %).
The first 90 days are covered by the US$300 trial credit.

Removed from the previous design (list prices, for comparison): Cloud SQL REGIONAL
`db-custom-2-7680` (2 HA vCPU ≈ 132.71 + 7.5 GiB HA memory ≈ 84.32 + 20 GB HA SSD ≈ 7.48),
Memorystore STANDARD_HA 5 GB with a replica (several hundred dollars; Basic M1 is $0.052/GiB-hour
in Montreal, ≈ US$38/month for 1 GiB, [memorystore pricing](https://cloud.google.com/memorystore/docs/redis/pricing)
with `northamerica-northeast1` selected),
two `e2-micro` connector VMs (≈ 15, from memory), Cloud NAT ($0.0014/h per VM + $0.005/h per
address + $0.045/GiB processed, [nat/pricing](https://cloud.google.com/nat/pricing)), the API at
2 vCPU / 2 GiB, the web service always on.

## Signals that it is time to scale up

Watch the alert policies of the monitoring module (`[prod] ...` in Cloud Monitoring):

| Signal | Threshold / alert | Action |
| --- | --- | --- |
| Sustained api CPU | `api CPU utilisation > 80% (10m)` firing daily, or p95 latency alert (> 1.5 s) during peaks | step 1 (Memorystore + instances) or `api_cpu = "2"` |
| api memory | `api memory utilisation > 85% (10m)` | `api_memory = "1.5Gi"` / `"2Gi"` (keep the 50 % heap share) |
| Database | `Cloud SQL connections > 40`, `Cloud SQL CPU > 80%`, slow-query log growth, disk alert | `sql_tier = "db-custom-1-3840"` (SLA-covered), then REGIONAL |
| Active users | a few thousand monthly actives, more than ~200 concurrent WebSocket sessions, or any need for two api instances (realtime fan-out, zero-overlap deploys) | step 1 |
| Availability needs | any incident caused by the single zone or the single instance, or a contractual uptime promise | REGIONAL Cloud SQL (step 2) |
| Spend | the US$150 budget emails | review the egress and Cloud Run lines before resizing |

## Scale-up path (variables only, in order)

1. **Memorystore Basic 1 GB + several api instances:** `redis_mode = "memorystore"`,
   `redis_tier = "BASIC"`, `redis_memory_size_gb = 1`, `api_max_instances = 3` (lower
   `api_db_pool_size` so instances × pool stays under `max_connections`). Terraform recreates
   the `redis-url` secret and the API reads it; the realtime pub/sub and rate limits become
   shared. About US$38/month in Montreal (Basic M1 $0.052/GiB-hour × 730 h, read on the pricing
   page with the region selected).
2. **An SLA-covered database, then HA:** `sql_tier = "db-custom-1-3840"`
   (`sql_connection_alert_threshold = 80`), later `sql_availability_type = "REGIONAL"` (twice
   the instance and storage price).
3. **A bigger api instance:** `api_cpu = "2"`, `api_memory = "2Gi"`.
4. ML returns: `ml_enabled = true`, `enable_vpc_connector = true`, `enable_cloud_nat = true`,
   `api_vpc_egress = "ALL_TRAFFIC"` (only after the owner lifts the Phase 11 hold).

## Consequences

- Prod boots: profile `prod` applies, every required secret exists, Cloud Scheduler calls are
  accepted, the web app gets its Firebase and Maps configuration, the certificate is issued behind
  Cloudflare, card images survive restarts.
- One instance, one zone, no SLA on the database tier: acceptable for year one, with backups,
  PITR, deletion protection and the alerts above as the safety net. The path to more is
  configuration, not code.
- Deploys use `gcloud run services update --container api`; the Valkey sidecar's image is
  Terraform-managed and pinned by digest.
- Things to confirm at the first `terraform apply` (documented in the variables): a loopback-only
  Valkey against Cloud Run's TCP startup probe (fallback `redis_sidecar_bind_address =
  "0.0.0.0"`; only the api container's port is reachable from outside), a fractional sidecar CPU
  next to a 1 vCPU main container, the Certificate Manager authorization on a Cloudflare zone.
  The sidecar CPU is the one cost-relevant unknown: the
  [CPU page](https://docs.cloud.google.com/run/docs/configuring/services/cpu) ties "less than
  1 vCPU" to request-based billing, the first-generation environment and concurrency 1 without
  saying whether that is judged per container or per instance. If the apply rejects 0.1 vCPU,
  do **not** give the sidecar a full vCPU (≈ US$51/month more, outside the budget): switch to
  `redis_mode = "memorystore"` (Basic 1 GiB ≈ US$38) or run Valkey inside the api container
  under a supervisor.
- The Cloudflare edge rate limit is coarser than before; the API's own limits are the real ones.
- CLAUDE.md's "Redis (Memorystore in cloud)" became "Valkey sidecar in year one, Memorystore on
  the scale-up path"; the non-negotiable part — never primary storage — is unchanged.
- Rejected: Memorystore Basic from day one (≈ US$38–45/month for a cache that holds nothing
  durable); dropping the load balancer and Cloud Armor for Cloudflare → Cloud Run directly
  (saves ≈ US$27 but exposes the `run.app` URL to anyone who finds it and loses the Cloudflare-only
  origin); Cloud SQL Enterprise Plus (no shared-core tier, `max_connections` and price far above
  need); a regional external LB (cheaper hourly rate in the Montreal table but a second
  certificate story and no global anycast); persistence for the sidecar (RDB files would live on
  the in-memory disk and count against the container's memory for data nobody needs back).
