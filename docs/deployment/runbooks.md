# Runbooks

Operational procedures for the Google Cloud environments. Replace `$ENV`, `$PROJECT_ID`,
`$REGION` with the values from [environments.md](environments.md). Every command is safe to
copy; destructive ones are marked. Record every production action in the incident/change log.

```bash
export ENV=prod PROJECT_ID=orenjitrade-prod-123456 REGION=northamerica-northeast1
```

## 1. Roll back a Cloud Run revision

Symptoms: 5xx ratio alert, p95 latency alert or failing smoke test right after a deploy.

```bash
SERVICE=orenjitrade-api-$ENV
gcloud run revisions list --service "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format 'table(metadata.name,status.conditions[0].status,metadata.creationTimestamp,spec.containers[0].image)'
# Route 100% of traffic to the last known-good revision (instant, no rebuild)
gcloud run services update-traffic "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --to-revisions orenjitrade-api-prod-00042-abc=100
```

The `deploy.yml` run summary prints this exact command with the previous revision names. When
the fix is ready, re-run **Deploy** with the new image tag; it resets traffic to `LATEST`.
Web and ml roll back the same way. Database migrations are forward-only (Flyway): a rollback
of the API must be compatible with the current schema; that is why migrations are additive and
destructive changes are done in a later release.

## 2. Scale

The first-year profile (ADR 0016) runs **exactly one** api instance: `api_max_instances` is
validated to 1 while `redis_mode = sidecar` (a localhost cache cannot fan out realtime events or
share rate-limit windows). The immediate lever is therefore a bigger instance, not more
instances. Out of band, until the next `terraform apply` resets it:

```bash
gcloud run services update orenjitrade-api-$ENV --region "$REGION" --project "$PROJECT_ID" \
  --container api --cpu 2 --memory 2Gi          # the valkey sidecar keeps its own limits
```

(`JAVA_TOOL_OPTIONS` caps the heap at 50 % of the container, so the heap follows the memory.)

Durable: the scale-up path of ADR 0016, in order, all in
`infrastructure/terraform/environments/$ENV/terraform.tfvars`, PR, `terraform apply`:

1. `redis_mode = "memorystore"`, `redis_tier = "BASIC"`, `redis_memory_size_gb = 1`,
   `api_max_instances = 3`, `api_db_pool_size = 8` — Terraform creates the Memorystore instance
   and the `redis-url` secret, the API switches to it on the next revision. Connection math:
   `api_max_instances × api_db_pool_size` + 3 reserved + Cloud SQL's own sessions must stay under
   the tier's `max_connections` (50 on `db-g1-small`; the alert fires at
   `sql_connection_alert_threshold`).
2. `sql_tier = "db-custom-1-3840"` (first SLA-covered tier, `max_connections` 100, set
   `sql_connection_alert_threshold = 80`), later `sql_availability_type = "REGIONAL"`. A tier
   change restarts the instance (a few minutes; REGIONAL instances fail over first).
3. `api_cpu = "2"`, `api_memory = "2Gi"`.

Signals that it is time: the `[prod] api CPU utilisation > 80%` / `memory utilisation > 85%`
alerts firing daily, `Cloud SQL connections > 40` or `Cloud SQL CPU > 80%`, the p95 latency
alert during peaks, a few thousand monthly actives or more than ~200 concurrent WebSocket
sessions (details in ADR 0016).

## 3. Rotate a secret

Terraform-generated secrets (`db-password`, `service-token`, `analytics-actor-salt`,
`ads-token-secret`, `consent-ip-salt`; `redis-url` only with `redis_mode = memorystore`):

```bash
cd infrastructure/terraform/environments/$ENV
terraform taint random_password.db_app_user      # or random_password.service_token, .analytics_actor_salt, .ads_token_secret, .consent_ip_salt
terraform apply                                  # new password on Cloud SQL user + new secret version
```

Rotating `analytics-actor-salt` breaks the continuity of `actor_hash` in BigQuery (acceptable,
analytics is derived data). (The former location jitter secret is gone with the coordinates,
ADR 0017.)

Cloud Run reads `latest` at instance start, so deploy a new revision (re-run **Deploy** with the
current tag or `gcloud run services update orenjitrade-api-$ENV --region "$REGION" --project
"$PROJECT_ID" --container api --update-env-vars ROTATED_AT=$(date +%s)`) to pick it up. Do the
rotation off-peak: with one instance the new revision replaces the old one within a minute and
the Valkey cache starts empty (runbook 9).

Operator-managed secrets (Stripe):

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add stripe-secret-key --data-file=- --project "$PROJECT_ID"
gcloud run services update orenjitrade-api-$ENV --region "$REGION" --project "$PROJECT_ID" --container api --update-env-vars ROTATED_AT=$(date +%s)
# after verification, disable the previous version (recoverable for version_destroy_ttl = 7 days)
gcloud secrets versions disable <previous-version> --secret stripe-secret-key --project "$PROJECT_ID"
```

Rotate Stripe keys in the Stripe dashboard first (roll key, keep the old one valid for the
overlap window). Webhook secret rotation: add the new endpoint secret, deploy, then delete the
old endpoint in Stripe.

## 4. Cloud SQL restore / point-in-time recovery

Full procedure in [backup-restore.md](backup-restore.md). Short version (**destructive if you
restore in place; prefer a clone**):

```bash
# Clone to a new instance at a timestamp (RFC 3339, UTC) — no impact on production
gcloud sql instances clone orenjitrade-$ENV orenjitrade-$ENV-pitr-$(date +%Y%m%d%H%M) \
  --point-in-time '2026-09-29T14:05:00Z' --project "$PROJECT_ID"
```

Then point a maintenance revision of the API at the clone (`DATABASE_URL` override) or copy
the affected rows back with `pg_dump -t`. Only restore in place when the whole database is
compromised and the incident commander approves.

## 5. Pub/Sub backlog drain

Alert: "oldest unacked message > 10m". In the first-year profile the only subscription is
`analytics-events-bigquery` (plus the DLQ inspect subscriptions): the `domain-events-api` push
subscription is created only with `pubsub_domain_events_push_enabled = true`, once the API
implements `/internal/events/pubsub` (ADR 0009); until then domain events never leave the
Spring Modulith outbox and the commands below that mention it do not apply.

```bash
gcloud pubsub subscriptions describe domain-events-api --project "$PROJECT_ID" --format 'yaml(pushConfig,deadLetterPolicy)'
gcloud monitoring metrics list --filter 'metric.type="pubsub.googleapis.com/subscription/num_undelivered_messages"' --project "$PROJECT_ID" >/dev/null
gcloud logging read 'resource.type="cloud_run_revision" httpRequest.requestUrl:"/internal/events/pubsub" httpRequest.status>=400' --limit 20 --project "$PROJECT_ID"
```

Common causes and fixes:

| Cause | Fix |
| --- | --- |
| Receiving service down / not ready | Fix or roll back the service (runbook 1); Pub/Sub retries with backoff, nothing is lost |
| 401/403 from `/internal/events/pubsub` | OIDC audience (`INTERNAL_AUDIENCE` = the public API URL, also a `custom_audiences` entry of the service) or `INTERNAL_INVOKERS` (pubsub-push SA email) mismatch; compare `push_subscriptions` in Terraform with the API env |
| Handler throws on a specific message | After 5 attempts it lands in `<topic>-dlq`. Inspect: `gcloud pubsub subscriptions pull domain-events-dlq-inspect --limit 10 --project "$PROJECT_ID"` |
| Backlog too large to catch up | With one instance, give it a bigger CPU (runbook 2); `api_max_instances > 1` only exists on the Memorystore path; handlers are idempotent (ADR 0009) so duplicate delivery is safe |

Replaying a DLQ after the fix (messages keep their attributes):

```bash
gcloud pubsub subscriptions pull domain-events-dlq-inspect --auto-ack --limit 100 --format json --project "$PROJECT_ID" \
  | jq -c '.[] | {data: .message.data, attributes: .message.attributes}' \
  | while read -r m; do
      gcloud pubsub topics publish domain-events --project "$PROJECT_ID" \
        --message "$(echo "$m" | jq -r .data | base64 -d)" \
        --attribute "$(echo "$m" | jq -r '.attributes | to_entries | map("\(.key)=\(.value)") | join(",")')"
    done
```

BigQuery subscription stuck (`analytics-events-bigquery`): check `bigqueryConfig.state`; a
`SCHEMA_MISMATCH` means a new event field was added without `drop_unknown_fields` handling —
fix the producer or add the column, messages wait in the subscription for 7 days.

## 6. Emergency feature-flag off

Business rules are data (ADR 0014). Flags live in `feature_flag`, are edited in `/admin >
Feature flags` (audited) and cached in Redis for at most 60 s. The flag keys are
`protectedPayments`, `premiumPlans`, `credits`, `donations`, `advertising`, `publicChat` and
`mlScanning` (section 9 lists what each one switches on and its launch value).

1. Preferred: **/admin > Feature flags** (signed in as a `SUPER_ADMIN`, second factor required
   outside `local`), toggle (e.g. `protectedPayments`, `publicChat`), confirm. Every instance
   picks it up within the cache TTL; the web app reads the flags once per session, so visitors
   see the change on their next page load.
2. If the admin console is unavailable, use the Cloud SQL Auth Proxy from an operator machine.
   `updated_by` is a foreign key to `user_account.id`: record the acting admin's account id (or
   leave it `NULL`, and write the incident id in the timeline instead):

```bash
cloud-sql-proxy "$PROJECT_ID:$REGION:orenjitrade-$ENV" --port 5433 &
PGPASSWORD=$(gcloud secrets versions access latest --secret db-password --project "$PROJECT_ID") \
  psql -h 127.0.0.1 -p 5433 -U orenjitrade orenjitrade \
  -c "UPDATE feature_flag SET enabled = false, updated_at = now(),
        updated_by = (SELECT id FROM user_account WHERE email = '<admin email>')
      WHERE key = 'protectedPayments';"
```

3. The rule caches (`orenji:cache:feature-flags:v1` and friends, `RedisJsonCache`) expire within
   60 s; a change through `/admin` evicts them at once. After a direct SQL change there is no
   shell into the Valkey sidecar: wait the TTL, or deploy a new revision (empty cache).
4. Verify with `curl https://api.<domain>/api/v1/public/feature-flags`.
5. Log the change in the incident timeline; re-enable through `/admin` after the fix.

## 7. Lock down during an attack

- Cloudflare: **Security > Settings > Security Level: I'm Under Attack** (challenge everyone),
  tighten rate limits, or add a WAF custom rule blocking the offending ASN/country.
- Confirm Cloud Armor is attached (`terraform output cloud_armor_policy`) so the origin is
  unreachable except through Cloudflare.
- Cloud Run already runs one instance (cost is capped by design); the API's own Redis rate
  limits (60/min anonymous per IP, 120/min per user) are the second line behind Cloudflare's
  single Free-plan edge rule (60 per 10 s per IP on the sensitive path prefixes).
- Cloud SQL: the connection alert (40) and CPU alert (80 %) tell you whether the database, not
  the API, is the bottleneck during the attack.

## 8. Incident checklist

1. **Declare**: open an incident channel/thread, name an incident commander (IC), note the start
   time (UTC) and the first alert. Severity: SEV1 = site down / data exposure, SEV2 = major
   feature broken, SEV3 = degraded.
2. **Stabilise first**: roll back (runbook 1), flag off (runbook 6), scale (runbook 2), lock
   down (runbook 7). Do not debug in production before stabilising.
3. **Communicate**: status update every 30 min (SEV1) / 60 min (SEV2) in the channel; user-facing
   notice on the Cloudflare status page or `/status` route if longer than 30 minutes.
4. **Preserve evidence**: export relevant logs (`gcloud logging read ... --format json > incident-<id>.json`),
   note revision names, Pub/Sub counts, Cloud SQL backup ids. Never export precise locations or
   PII outside the project (ADR 0004).
5. **Security incidents**: rotate every possibly exposed secret (runbook 3), revoke Firebase
   sessions for affected accounts (`firebase auth:revoke` / Admin SDK), review audit_log rows,
   contact the security owner in `docs/security/README.md`; assess notification duties
   (Quebec Law 25 / PIPEDA within the legal timelines).
6. **Resolve**: confirm alerts cleared for 30 minutes, uptime checks green, error budget noted.
7. **Postmortem** within 5 working days: blameless, timeline, root cause, contributing factors,
   action items with owners, added tests/alerts. Store under `docs/deployment/postmortems/`.

<!-- Low-cost first-year profile runbooks (ADR 0016, 2026-10-05). Kept as separate sections so
     parallel edits to this file (e.g. "Launch configuration") merge cleanly. -->

## 9. The Redis sidecar (Valkey) and what a restart means

Prod runs its Redis as a Valkey sidecar inside the api instance (`127.0.0.1:6379`, no
persistence, 200 MB `allkeys-lru`; ADR 0016). It restarts with the instance: every deploy, a
crash, Cloud Run maintenance. Nothing authoritative lives there (CLAUDE.md), so there is nothing
to restore; expect, right after a restart:

| What | Effect | Lasts |
| --- | --- | --- |
| Rate-limit windows | each client gets one fresh window | one window (≤ 24 h for the daily policies) |
| Rule / regions / discovery caches, usage mirror, credit balance cache | one database read per key, then warm | seconds to 10 minutes |
| Presence | everyone appears offline | ≤ 60 s (next heartbeat) |
| Binder view de-duplication | a binder re-opened the same day counts again | until midnight UTC |
| `Idempotency-Key` for `POST /offers`, `POST /reports` | a retried request after the restart can create a duplicate | 24 h; the only user-visible loss |

Diagnosis when the instance is not ready: `curl -s https://api.orenjitrade.com/actuator/health/readiness`
shows the `redis` component; `gcloud run revisions describe <rev> --region "$REGION" --format
'yaml(status.conditions)'` shows which container failed its probe. If the `valkey` container never
passes its TCP startup probe (first apply only), set `redis_sidecar_bind_address = "0.0.0.0"`
in tfvars and re-apply (only the api container's port is reachable from outside the instance).

To see the cache from inside the instance there is no shell; use the API's Lettuce metrics
under `/actuator/metrics` (`lettuce.command.*`, when Micrometer exposes them) or temporarily
raise the Spring Data Redis log level through a revision env var. Memory pressure shows as
evictions first, never as errors: the API fails open on every Redis path.

## 10. A budget alert arrived

The US$150/month budget (`module.billing_budget`, credits excluded) emails at 50 %, 90 %, 100 %
of the actual spend and at 100 % of the forecast. It never stops anything by itself.

1. **Billing > Reports**, group by service for the current month. The expected shape is in
   `README.md` section 13: Cloud Run ≈ 68, Cloud SQL ≈ 31, Networking (LB + egress) ≈ 23–31,
   Cloud Armor ≈ 8–10, everything else < 3.
2. Networking egress above plan: check Cloudflare **Caching > Overview** (cache hit ratio for
   `www` assets and `/api/v1/public/card-images/`) and the Cloud Run request logs for a scraper;
   tighten the edge rate limit (`rate_limit_requests_per_10s`) or add a WAF custom rule.
3. Cloud Run above plan: a second revision serving traffic (`gcloud run services describe ...
   --format 'yaml(status.traffic)'`), or an out-of-band `--cpu`/`--memory` change (runbook 2)
   that Terraform has not reset.
4. Anything unexplained (no map provider is billed since ADR 0017): `gcloud billing accounts list`, then **Billing > Cost table** filtered
   by SKU; Cloud SQL storage auto-resize and backup growth are visible there.

## 11. Cloud SQL restore (first-year profile)

Prod keeps 7 automated daily backups and 7 days of PITR logs on a single-zone `db-g1-small`
(no SLA on that tier). Full procedures, including restoring a backup **to a different
instance** with `--backup-instance`, are in [backup-restore.md](backup-restore.md); runbook 4
has the PITR clone one-liner. During a zonal outage the instance is unavailable until Google
recovers the zone or you restore into a new instance (RTO target 1 h, RPO 5 minutes).

## 12. Launch configuration (2026-10-05): money features off

OrenjiTrade launches as **discovery + messaging only**: collectors find each other on the map and
chat, then trade on their own. Every money feature stays switched off until the owner turns it on.
The switches are the `feature_flag` rows (ADR 0014): nothing is hard-coded, the launch state is
data created by the migrations, and a `SUPER_ADMIN` changes it in `/admin > Feature flags`.

### Flag table

| Flag | Launch value | Migration state of a fresh database | What it switches on (API and web) | Why this value at launch |
| --- | --- | --- | --- | --- |
| `protectedPayments` | **off** | off (V010) | Seller payouts (Settings → Payouts, `GET/POST /me/seller-account*`), "Use payment protection" on cash offers, `POST /trades/{id}/pay`, `/ship`, `/confirm-receipt`, disputes, the payment webhook and the fake checkout. Off: an accepted offer opens the trade as `AGREED` (in-person exchange), payment routes answer `404 FEATURE_DISABLED` | No Stripe account or keys; the Payment Protection and Refund policies are unreviewed drafts; `PAYMENT_PROVIDER` is `fake` unless `stripe_secrets_enabled` (Terraform), so a live flag would run a *fake* checkout in production |
| `premiumPlans` | **off** | **on in V010, off since V105** | `POST /me/subscription/checkout`, the fake billing checkout, the "Upgrade to Premium" button on `/premium`, the Premium entries of the account menu and footer, "See Premium" in the limit dialog, the wishlist / map / binder upgrade links, the upgrade sentence and `/premium` deep link of the daily-limit notification. Off: `/premium` only shows "Premium is not available yet" (a live subscription stays manageable) and nothing links to it | No paid plan at launch; `BILLING_PROVIDER` defaults to `fake` (Terraform does not set it), so a live flag would grant Premium for free through the fake checkout |
| `credits` | **off** | **on in V010, off since V105** | `/credits`, `GET /me/credits`, `POST /me/credits/spend`, referrals (`/me/referrals*`), "Use credits" on `/premium`. Off: the routes answer `404 FEATURE_DISABLED`, the menu entry and page are hidden | Credits are non-cash, but they are a money-adjacent feature the owner keeps off for the first users |
| `donations` | **off** | off (V010) | `/support`, `POST /donations/checkout`, the supporters list, the donation webhook, the footer link. Off: `404 FEATURE_DISABLED`, nothing links to it | Only the fake donation provider exists (`DONATION_PROVIDER=fake` is the only implementation) |
| `advertising` | **off** | off (V010) | Sponsored placements (`GET /ads`, impressions and clicks). Off: `GET /ads` answers `[]` (never an error) and the sponsored slots render nothing | No advertiser at launch |
| `mlScanning` | **off** | off (V010) | Nothing yet: no consumer in the API, web or mobile (Phase 11 on hold by owner instruction) | Owner hold; do not switch on before the owner lifts it |
| `publicChat` | **on** | on (V010) | Community channels (`/community`, `/api/v1/community/**`). Off: `404 FEATURE_DISABLED` and the nav entry disappears; the moderator console stays | Part of "discovery + messaging"; moderated, reportable, blockable |

Always available regardless of the flags: the admin consoles (`/admin/payments`,
`/admin/disputes`, `/admin/subscriptions`, `/admin/credits`, `/admin/donations`, `/admin/ads`),
`GET /api/v1/plans` and `GET /api/v1/me/plan` (the apps read the plan limits from them;
the plan answer and the `429 LIMIT_REACHED` Problem Details carry `upgradeUrl: /premium` as data,
and clients hide it while the flag is off), `POST /me/subscription/cancel` and the billing
webhook (an existing subscription stays manageable and renewals keep being recorded).

### How to change a flag in `/admin`

1. Sign in as a `SUPER_ADMIN` (an `ADMIN` sees the page read-only). Outside `local` the account
   must have signed in with a second factor (`orenji.security.admin.require-mfa`, see
   `docs/security/owner-account-security-checklist.md`).
2. **/admin > Feature flags**: move the switch, confirm in the dialog. The change is audited
   (`feature_flag.update` with the previous and new values), the Redis cache
   (`orenji:cache:feature-flags:v1`) is evicted at once and every API instance answers the new
   value immediately; a web visitor sees it on the next page load (the app reads
   `GET /api/v1/public/feature-flags` once per session).
3. Verify: `curl https://api.<domain>/api/v1/public/feature-flags` and, for the UI, the account
   menu and footer of a signed-in collector.
4. Prerequisites before switching a money feature **on** (not before): `protectedPayments` needs
   Stripe Connect live keys in Secret Manager and `stripe_secrets_enabled = true`
   (`PAYMENT_PROVIDER=stripe`), the webhook endpoint registered at Stripe, and the Payment
   Protection / Refund policies reviewed by the lawyer; `premiumPlans` needs
   `BILLING_PROVIDER=stripe` with `STRIPE_PRICE_PREMIUM` and the plan prices reviewed; `donations`
   needs a real donation provider (none implemented); `advertising` needs campaigns in
   `/admin > Ads`; `mlScanning` needs the owner to lift the Phase 11 hold.

### Why `premiumPlans` and `credits` needed a migration

`V010__feature_flags.sql` created `premiumPlans` and `credits` **enabled** (the Phase 10
defaults, when Premium was only marketing). On a production database migrated from scratch the
first boot would therefore have shown "Upgrade to Premium" with a live checkout — through the
*fake* billing provider, since no Stripe configuration exists, so anyone could have subscribed
without paying — and exposed the credits and referral ledger, until a `SUPER_ADMIN` (who first
needs MFA enrolment) switched them off. Applied migrations are never edited (CLAUDE.md), so the
handling is `V105__launch_money_flags_off.sql`: an explicit data change that switches both rows
off while respecting rows an admin already edited (`updated_by IS NOT NULL`), plus the local/dev
seed (`FeatureFlagSeedContributor`) that switches every fake-provider flag back on so development
and the E2E suites keep exercising those flows. `FeatureFlagsIT` asserts the migration state,
`LaunchConfigurationIT` that everything else works with every money flag off, and the Playwright
project `launch-config` that no payment or subscription entry point is visible. Not chosen:
editing V010, a manual post-deploy admin step alone (a window of exposure), or constants in code
(ADR 0014).

### Pre-launch check (first production deploy)

1. `GET /api/v1/public/feature-flags` answers `publicChat: true` and `false` for the six others;
   `/admin > Feature flags` shows the same with no "edited by" author.
2. Environment of the API revision: `PAYMENT_PROVIDER=fake`, no `BILLING_PROVIDER` /
   `DONATION_PROVIDER` override, no `stripe-*` secret versions, `PUSH_PROVIDER=fcm`,
   `EMAIL_PROVIDER=log` (no transactional e-mail provider exists yet; only Firebase sends e-mails).
3. As a collector: the account menu lists Profile, Offers, Trades, Settings (no Premium, Credits
   or Support entries); the footer has only the legal links; `/premium` says "Premium is not
   available yet"; `/credits`, `/support` and `/settings/payouts` redirect with "… is not
   available right now."; "Make an offer" has no payment-protection checkbox; an accepted offer
   shows "meet and exchange the cards" with the trading safety notice and no "Pay" button.
4. Mobile: the Expo app has no feature-flag consumer and no money screen; it keeps reading
   `/plans` and `/me/plan`. Its `LIMIT_REACHED` wording still mentions Premium (mobile follow-up
   in `IMPLEMENTATION_STATUS.md`).
