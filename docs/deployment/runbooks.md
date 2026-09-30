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

3. Flush the rule cache if you cannot wait for the TTL (from a Cloud Run job or the admin
   "Invalidate caches" action): keys `rules:*` in Redis.
4. Log the change in the incident timeline; re-enable through `/admin` after the fix.

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
