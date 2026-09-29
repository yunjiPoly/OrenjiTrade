# Backup and restore

What is backed up, how long it is kept, how to restore it, and how often the restore path is
rehearsed. Targets: **RPO 5 minutes** (Cloud SQL PITR) and **RTO 1 hour** for the database in
production. Configuration values come from `infrastructure/terraform/modules/cloud-sql`,
`storage`, `bigquery` and the environment defaults in `docs/deployment/environments.md`.

## Inventory

| Data | Where | Backup mechanism | Retention | Restore path |
| --- | --- | --- | --- | --- |
| Transactional data (users, inventory, binders, messages, offers, audit log, feature flags) | Cloud SQL PostgreSQL 17 | Automated daily backups (07:00 UTC) + point-in-time recovery from WAL | dev/staging 7 backups, 7 days WAL; prod 30 backups, 14 days WAL | Clone/restore (below) |
| User media (avatars, card photos) | GCS `<project>-media` | Object versioning (prod) + soft delete 7 days; regional bucket with Google's 11 nines durability | non-current versions: 3 kept; `tmp/` purged after 2 days | Restore version / undelete (below) |
| Analytics events | BigQuery `orenjitrade_analytics.events` | BigQuery time travel (7 days) + fail-safe (7 days); source of truth is the Pub/Sub topic for 7 days | prod partitions never expire | `SELECT ... FOR SYSTEM_TIME AS OF` |
| Redis (caches, rate limits, presence) | Memorystore | RDB snapshot every 12 h in prod | ephemeral by design; nothing authoritative | Warm-up on restart; no restore needed |
| Secrets | Secret Manager | Versioned; destroyed versions recoverable for 7 days (`version_destroy_ttl`) | all versions | `gcloud secrets versions enable` |
| Infrastructure | Terraform state in GCS (versioned bucket) + git | Bucket versioning | all versions | `terraform apply` from git; state rollback via object version |
| Container images | Artifact Registry | Cleanup keeps last 20 versions + every `v*` tag | see `artifact-registry` module | Redeploy previous tag |
| Identity (accounts, providers) | Firebase Authentication | Google-managed; export with `firebase auth:export` monthly to a restricted bucket | 90 days of exports | `firebase auth:import` |

Not backed up on purpose: Redis contents, `tmp/` uploads, Cloud Run revisions older than the
image retention.

## Cloud SQL

### Settings (Terraform)

- `backup_configuration.enabled = true`, `start_time = 07:00 UTC`,
  `point_in_time_recovery_enabled = true`, `transaction_log_retention_days` 7 (dev/staging) or
  14 (prod), `retained_backups` 7 or 30, `backup_location` defaults to the instance region
  (set `backup_location = "northamerica-northeast2"` for cross-region copies if the
  organisation requires it).
- `deletion_protection = true` in prod at both Terraform and API level; `final_backup` is taken
  automatically by Cloud SQL on deletion when enabled.

### Take an on-demand backup (before risky migrations)

```bash
gcloud sql backups create --instance orenjitrade-$ENV --project "$PROJECT_ID" --description "pre-release-v1.4.0"
gcloud sql backups list --instance orenjitrade-$ENV --project "$PROJECT_ID"
```

### Point-in-time recovery to a new instance (preferred)

```bash
gcloud sql instances clone orenjitrade-$ENV orenjitrade-$ENV-pitr-20260929 \
  --point-in-time '2026-09-29T14:05:00Z' --project "$PROJECT_ID"
# The clone lands on the same VPC (private IP). Get its address:
gcloud sql instances describe orenjitrade-$ENV-pitr-20260929 --project "$PROJECT_ID" --format 'value(ipAddresses[0].ipAddress)'
```

Then either:

- **Surgical**: connect through the Cloud SQL Auth Proxy to the clone, `pg_dump -t <table>
  --data-only` the affected rows and apply to production inside a transaction, or
- **Full switch** (whole database corrupted): put the API in maintenance (scale to 0 or flag),
  update `DATABASE_URL` on the api service to the clone's IP, verify, then make the clone the
  new primary by importing it into Terraform (`terraform import module.cloud_sql...`) or
  restoring the primary from the clone's backup. Delete the old instance only after a week.

### Restore a backup in place (destructive)

```bash
gcloud sql backups restore <BACKUP_ID> --restore-instance orenjitrade-$ENV --project "$PROJECT_ID"
```

Overwrites all data since the backup; requires incident commander approval and a fresh
on-demand backup of the current state first.

### Logical exports (monthly, off-site)

```bash
gcloud sql export sql orenjitrade-$ENV gs://${PROJECT_ID}-db-exports/orenjitrade-$(date +%F).sql.gz \
  --database orenjitrade --offload --project "$PROJECT_ID"
```

The export bucket is in a different region, has a 365-day retention policy and is readable
only by the operators group. Exports contain PII and precise location columns: they are
classified **Restricted** (`docs/security/README.md`) and never copied to laptops.

## Media bucket (GCS)

- prod: versioning on, 3 non-current versions kept, soft delete 7 days, public access prevented.
- Restore an overwritten/deleted object:

```bash
gcloud storage ls -a gs://${PROJECT_ID}-media/users/<id>/avatar.webp        # lists generations
gcloud storage cp gs://${PROJECT_ID}-media/users/<id>/avatar.webp#<generation> gs://${PROJECT_ID}-media/users/<id>/avatar.webp
# Soft-deleted objects (within 7 days):
gcloud storage restore gs://${PROJECT_ID}-media/users/<id>/avatar.webp#<generation>
```

- Bulk disaster (bucket deleted): impossible while `force_destroy = false` and the operators
  group is the only admin; recreate with Terraform and restore from the monthly
  `gcloud storage rsync` copy in the export bucket if one is configured.

## BigQuery

```sql
-- Recover rows deleted in the last 7 days
SELECT * FROM `orenjitrade-prod-123456.orenjitrade_analytics.events`
FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
WHERE occurred_at >= '2026-09-27';
```

Longer-term loss is replayable from the `analytics-events` topic for 7 days, after which the
data is considered lost (analytics is derived data, not a system of record).

## Secrets and Terraform state

- Secret versions are never deleted immediately (`version_destroy_ttl = 7 days`): re-enable with
  `gcloud secrets versions enable <n> --secret <id>`.
- State bucket versioning allows `gcloud storage cp gs://<bucket>/environments/prod/default.tfstate#<generation> ...`
  to roll back a corrupted state. Always `terraform state pull` to a secure location before
  manual surgery and `terraform plan` afterwards.

## Restore drills

| Drill | Frequency | Environment | Pass criteria |
| --- | --- | --- | --- |
| PITR clone + row-level recovery | quarterly | staging | Clone reachable, rows recovered, < 60 min |
| Full backup restore to fresh instance + API smoke tests | twice a year | staging | Readiness OK, `/api/v1/meta` OK, seed users can log in |
| Media object version restore | quarterly | prod (single test object) | Restored generation served through a signed URL |
| Firebase auth export/import | yearly | dev | Test accounts sign in after import |
| Terraform state rollback | yearly | dev | `terraform plan` shows no unexpected changes |

Record each drill (date, operator, duration, issues) in `docs/deployment/drills.md`.
