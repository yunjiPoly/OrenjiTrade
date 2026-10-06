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

Immediate (out of band, until the next `terraform apply` which resets it):

```bash
gcloud run services update orenjitrade-api-$ENV --region "$REGION" --project "$PROJECT_ID" \
  --min-instances 2 --max-instances 40 --concurrency 60
```

Durable: change `api_min_instances` / `api_max_instances` / `api_cpu` / `api_memory` in
`infrastructure/terraform/environments/$ENV/terraform.tfvars` (or the defaults in
`variables.tf`), PR, `terraform apply`. Cloud SQL: change `sql_tier` (causes a restart of a few
minutes; REGIONAL instances fail over first). Redis: `redis_memory_size_gb` scales online.
Check connection math: `max_instances × HikariCP pool size` must stay under the Cloud SQL
tier's `max_connections` (alert threshold `sql_connection_alert_threshold`).

## 3. Rotate a secret

Terraform-generated secrets (`db-password`, `redis-url`, `service-token`):

```bash
cd infrastructure/terraform/environments/$ENV
terraform taint random_password.db_app_user      # or random_password.service_token
terraform apply                                  # new password on Cloud SQL user + new secret version
```

Cloud Run reads `latest` at instance start, so deploy a new revision (re-run **Deploy** with the
current tag or `gcloud run services update ... --update-env-vars ROTATED_AT=$(date +%s)`) to
pick it up. Do the rotation off-peak: instances started before the rotation keep the old
password until they are replaced.

Operator-managed secrets (Stripe):

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add stripe-secret-key --data-file=- --project "$PROJECT_ID"
gcloud run services update orenjitrade-api-$ENV --region "$REGION" --project "$PROJECT_ID" --update-env-vars ROTATED_AT=$(date +%s)
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

Alert: "oldest unacked message > 10m".

```bash
gcloud pubsub subscriptions describe domain-events-api --project "$PROJECT_ID" --format 'yaml(pushConfig,deadLetterPolicy)'
gcloud monitoring metrics list --filter 'metric.type="pubsub.googleapis.com/subscription/num_undelivered_messages"' --project "$PROJECT_ID" >/dev/null
gcloud logging read 'resource.type="cloud_run_revision" httpRequest.requestUrl:"/internal/events/pubsub" httpRequest.status>=400' --limit 20 --project "$PROJECT_ID"
```

Common causes and fixes:

| Cause | Fix |
| --- | --- |
| Receiving service down / not ready | Fix or roll back the service (runbook 1); Pub/Sub retries with backoff, nothing is lost |
| 401/403 from `/internal/events/pubsub` | OIDC audience or `PUBSUB_PUSH_INVOKER_EMAIL` mismatch; compare `push_subscriptions` in Terraform with the API config |
| Handler throws on a specific message | After 5 attempts it lands in `<topic>-dlq`. Inspect: `gcloud pubsub subscriptions pull domain-events-dlq-inspect --limit 10 --project "$PROJECT_ID"` |
| Backlog too large to catch up | Temporarily raise `api_max_instances`; handlers are idempotent (ADR 0009) so duplicate delivery is safe |

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

3. Flush the flag cache if you cannot wait for the TTL: the Redis key is
   `orenji:cache:feature-flags:v1` (`redis-cli DEL orenji:cache:feature-flags:v1` through the
   Memorystore VPC, or the admin "Invalidate caches" action). Other rule caches live under
   `orenji:cache:*`.
4. Verify with `curl https://api.<domain>/api/v1/public/feature-flags`.
5. Log the change in the incident timeline; re-enable through `/admin` after the fix.

## 7. Lock down during an attack

- Cloudflare: **Security > Settings > Security Level: I'm Under Attack** (challenge everyone),
  tighten rate limits, or add a WAF custom rule blocking the offending ASN/country.
- Confirm Cloud Armor is attached (`terraform output cloud_armor_policy`) so the origin is
  unreachable except through Cloudflare.
- Cloud Run: lower `max_instances` temporarily to cap cost if the attack is authenticated.

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

## 9. Launch configuration (2026-10-05): money features off

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
`GET /api/v1/plans` and `GET /api/v1/me/plan` (the mobile app reads the map radius cap from them;
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
