# Analytics warehouse (ARCHITECTURE.md section 8). Events arrive through a Pub/Sub BigQuery
# subscription; the table is partitioned by occurred_at (day) and clustered by event_type.
# Events never contain PII or any location below a state/province: actor_hash, region_code and
# subdivision_code only (platform regions, ADR 0017).

locals {
  pubsub_service_agent = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"

  events_schema = [
    { name = "event_id", type = "STRING", mode = "REQUIRED", description = "UUID of the event (idempotency key)." },
    { name = "event_type", type = "STRING", mode = "REQUIRED", description = "Dotted event name, e.g. inventory.item.published." },
    { name = "event_version", type = "INTEGER", mode = "REQUIRED", description = "Schema version of the payload." },
    { name = "occurred_at", type = "TIMESTAMP", mode = "REQUIRED", description = "When the event happened (UTC)." },
    { name = "actor_hash", type = "STRING", mode = "NULLABLE", description = "HMAC of the acting user id; never the raw id." },
    { name = "region_code", type = "STRING", mode = "NULLABLE", description = "Platform region code (americas-north, americas-south, europe)." },
    { name = "subdivision_code", type = "STRING", mode = "NULLABLE", description = "ISO 3166-2 subdivision code (state/province), never a city or a point." },
    { name = "payload", type = "JSON", mode = "NULLABLE", description = "Event-specific attributes (no PII)." },
  ]
}

resource "google_bigquery_dataset" "analytics" {
  project                    = var.project_id
  dataset_id                 = var.dataset_id
  friendly_name              = "OrenjiTrade analytics"
  description                = "Product analytics events. No PII, no precise coordinates (ADR 0004)."
  location                   = var.location
  delete_contents_on_destroy = var.delete_contents_on_destroy
  labels                     = var.labels

  default_partition_expiration_ms = var.partition_expiration_days == null ? null : var.partition_expiration_days * 86400000
}

resource "google_bigquery_table" "events" {
  project             = var.project_id
  dataset_id          = google_bigquery_dataset.analytics.dataset_id
  table_id            = var.events_table_id
  description         = "Analytics events streamed from Pub/Sub topic analytics-events."
  deletion_protection = var.deletion_protection
  clustering          = ["event_type"]
  labels              = var.labels
  schema              = jsonencode(local.events_schema)

  time_partitioning {
    type          = "DAY"
    field         = "occurred_at"
    expiration_ms = var.partition_expiration_days == null ? null : var.partition_expiration_days * 86400000
  }

  require_partition_filter = false
}

# Pub/Sub BigQuery subscriptions write as the Pub/Sub service agent.
resource "google_bigquery_table_iam_member" "pubsub_writer" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  table_id   = google_bigquery_table.events.table_id
  role       = "roles/bigquery.dataEditor"
  member     = local.pubsub_service_agent
}

resource "google_bigquery_dataset_iam_member" "pubsub_metadata_viewer" {
  project    = var.project_id
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  role       = "roles/bigquery.metadataViewer"
  member     = local.pubsub_service_agent
}

resource "google_bigquery_dataset_iam_member" "readers" {
  for_each = toset(var.reader_members)

  project    = var.project_id
  dataset_id = google_bigquery_dataset.analytics.dataset_id
  role       = "roles/bigquery.dataViewer"
  member     = each.value
}
