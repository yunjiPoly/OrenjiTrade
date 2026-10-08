# Backup and restore

What is backed up, how long it is kept, how to restore it, and how often the restore path is
rehearsed. Targets: **RPO 5 minutes** (Cloud SQL PITR) and **RTO 1 hour** for the database in
production. Configuration values come from `infrastructure/terraform/modules/cloud-sql`,
`storage`, `bigquery` and the environment defaults in `docs/deployment/environments.md`.

## Inventory

| Data | Where | Backup mechanism | Retention | Restore path |
| --- | --- | --- | --- | --- |
| Transactional data (users, inventory, binders, messages, offers, audit log, feature flags, card image accounting) | Cloud SQL PostgreSQL 17 (`db-g1-small` ZONAL, Enterprise edition, ADR 0016) | Automated daily backups (07:00 UTC) + point-in-time recovery from WAL | 7 retained backups (`sql_retained_backups`, raise it for longer), 7 days of logs (Enterprise edition maximum) | Clone / restore (below) |
| User media (avatars, card photos, message uploads, dispute evidence) | GCS `<project>-media` (`avatars/`, `inventory/`, `uploads/`, `disputes/`) | Object versioning (prod) + soft delete 7 days; regional bucket with Google's 11 nines durability | non-current versions: 3 kept; `tmp/` purged after 2 days | Restore version / undelete (below) |
| Card image renditions (ADR 0015) | GCS `<project>-media` prefix `card-images/` | **Not backed up**: a re-fillable cache of 320 px renditions; `card_image` rows in Cloud SQL know every object and the start-up reconciliation repairs rows whose object is gone | soft delete 7 days like the rest of the bucket | On-demand refill when a card is viewed, or `npm run catalog:import -- --images referenced` (5 requests/second to the provider) |
| Analytics events | BigQuery `orenjitrade_analytics.events` | BigQuery time travel (7 days) + fail-safe (7 days); source of truth is the Pub/Sub topic for 7 days | prod partitions never expire | `SELECT ... FOR SYSTEM_TIME AS OF` |
| Redis (caches, rate limits, presence, realtime fan-out) | Valkey sidecar of the api instance (ADR 0016; Memorystore only on the scale-up path) | None: no persistence by design, restarts empty with the instance | ephemeral; nothing authoritative | Warm-up on restart; `runbooks.md` section 9 lists what a restart costs |
| Secrets | Secret Manager | Versioned; destroyed versions recoverable for 7 days (`version_destroy_ttl`) | all versions | `gcloud secrets versions enable` |
| Infrastructure | Terraform state in GCS (versioned bucket) + git | Bucket versioning | all versions | `terraform apply` from git; state rollback via object version |
| Container images | Artifact Registry | Cleanup keeps the last 10 versions per image + every `v*` tag (older tagged versions deleted after 30 days) | see `artifact-registry` module | Redeploy previous tag |
| Identity (accounts, providers) | Firebase Authentication | Google-managed; export with `firebase auth:export` monthly to a restricted bucket | 90 days of exports | `firebase auth:import` |

Not backed up on purpose: Redis contents, card image renditions (re-fillable), `tmp/` uploads,
Cloud Run revisions older than the image retention.

Single-zone caveat (ADR 0016): the `db-g1-small` tier has no SLA and no standby; a zonal outage
means downtime until the zone recovers or a backup is restored into a new instance. The data
itself is protected by the backups and PITR logs, which Cloud SQL stores outside the instance.

## Cloud SQL

### Settings (Terraform)

- `backup_configuration.enabled = true`, `start_time = 07:00 UTC`,
  `point_in_time_recovery_enabled = true`, `transaction_log_retention_days` 7 (the Cloud SQL
  Enterprise edition maximum; `ENTERPRISE_PLUS` allows up to 35), `retained_backups` 7 in every
  environment (`sql_retained_backups`; 30 costs about US$0.088 per GiB-month more and is a
  one-line change), `backup_location` defaults to the instance region (set
  `backup_location = "northamerica-northeast2"` for cross-region copies if the organisation
  requires it).
- `settings.edition = "ENTERPRISE"` explicitly (PostgreSQL 16+ defaults to Enterprise Plus, which
  has no shared-core tiers), `availability_type = ZONAL`, `disk_autoresize = true` from 10 GB.
- `deletion_protection = true` in prod at both Terraform and API level; `final_backup` is taken
  automatically by Cloud SQL on deletion when enabled.

Source for the commands below: [Cloud SQL — Restore an instance](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restoring)
(checked 2026-10-05).

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

### Restore a backup to a different instance (preferred for a full loss)

```bash
gcloud sql backups list --instance orenjitrade-$ENV --project "$PROJECT_ID"      # pick BACKUP_ID
# Target: a new instance with the same database version and at least the source's storage,
# created with Terraform (temporary name) or by hand; it must have no read replicas.
gcloud sql backups restore <BACKUP_ID> \
  --restore-instance orenjitrade-$ENV-restore-$(date +%Y%m%d) \
  --backup-instance orenjitrade-$ENV --project "$PROJECT_ID"
```

The restore overwrites everything on the target, including its PITR logs, and takes minutes on
a 10 GB disk. Then point a maintenance revision of the API at it (`DATABASE_URL` on the `api`
container; the private IP is in `gcloud sql instances describe ... --format
'value(ipAddresses[0].ipAddress)'`), verify, and either keep it (import into Terraform state and
rename in tfvars) or copy the rows back and delete it after a week. Backups of a **deleted**
instance (final or retained backups) restore with the same command.

### Restore a backup in place (destructive)

```bash
gcloud sql backups restore <BACKUP_ID> --restore-instance orenjitrade-$ENV --project "$PROJECT_ID"
```

Overwrites all data since the backup (and the PITR logs); requires incident commander approval,
a fresh on-demand backup of the current state first, and no read replicas on the instance (there
are none in the first-year profile).

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
| PITR clone + row-level recovery | quarterly | prod (clone with a temporary name, deleted afterwards) or staging while it is up | Clone reachable, rows recovered, < 60 min |
| Full backup restore to a fresh instance (`--backup-instance`) + API smoke tests | twice a year, e.g. during a temporary staging rehearsal (`README.md` section 12) | staging | Readiness OK, `/api/v1/meta` OK, seed users can log in |
| Media object version restore | quarterly | prod (single test object) | Restored generation served through `GET /api/v1/public/media/{key}` |
| Card image cache refill after a wiped prefix | yearly | staging | `npm run card-images:status` shows the rows CACHED again after `catalog:import --images referenced` |
| Firebase auth export/import | yearly | dev | Test accounts sign in after import |
| Terraform state rollback | yearly | dev | `terraform plan` shows no unexpected changes |

Record each drill (date, operator, duration, issues) in `docs/deployment/drills.md`.
