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

**Never taint `random_password.location_jitter_secret`** outside a deliberate, announced
migration: it seeds the deterministic public-point jitter (ADR 0004), so a new value moves every
collector's public point and breaks the "same input, same output" guarantee that prevents
triangulation. Rotating `analytics-actor-salt` breaks the continuity of `actor_hash` in
BigQuery (acceptable, analytics is derived data).

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
Feature flags` (audited) and cached in Redis for at most 60 s.

1. Preferred: **/admin > Feature flags**, toggle (e.g. `protectedPayments`, `mlScanning`,
   `publicCommunityChannels`), confirm. Every instance picks it up within the cache TTL.
2. If the admin console is unavailable, use the Cloud SQL Auth Proxy from an operator machine:

```bash
cloud-sql-proxy "$PROJECT_ID:$REGION:orenjitrade-$ENV" --port 5433 &
PGPASSWORD=$(gcloud secrets versions access latest --secret db-password --project "$PROJECT_ID") \
  psql -h 127.0.0.1 -p 5433 -U orenjitrade orenjitrade \
  -c "UPDATE feature_flag SET enabled = false, updated_by = 'incident-<id>', updated_at = now() WHERE key = 'protectedPayments';"
```

3. The rule caches (`orenji:cache:feature-flags:v1` and friends, `RedisJsonCache`) expire within
   60 s; a change through `/admin` evicts them at once. After a direct SQL change there is no
   shell into the Valkey sidecar: wait the TTL, or deploy a new revision (empty cache).
4. Log the change in the incident timeline; re-enable through `/admin` after the fix.

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
| Rule / nearby caches, usage mirror, credit balance cache | one database read per key, then warm | seconds to 10 minutes |
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
4. Google Maps Platform charges: the Maps JavaScript API quota cap (`README.md` section 10) is
   missing or too high.
5. Anything unexplained: `gcloud billing accounts list`, then **Billing > Cost table** filtered
   by SKU; Cloud SQL storage auto-resize and backup growth are visible there.

## 11. Cloud SQL restore (first-year profile)

Prod keeps 7 automated daily backups and 7 days of PITR logs on a single-zone `db-g1-small`
(no SLA on that tier). Full procedures, including restoring a backup **to a different
instance** with `--backup-instance`, are in [backup-restore.md](backup-restore.md); runbook 4
has the PITR clone one-liner. During a zonal outage the instance is unavailable until Google
recovers the zone or you restore into a new instance (RTO target 1 h, RPO 5 minutes).
