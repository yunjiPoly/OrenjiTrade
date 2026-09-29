output "dataset_id" {
  description = "Dataset id."
  value       = google_bigquery_dataset.analytics.dataset_id
}

output "events_table_id" {
  description = "Events table id."
  value       = google_bigquery_table.events.table_id
}

output "events_table_reference" {
  description = "project.dataset.table, the form expected by Pub/Sub BigQuery subscriptions."
  value       = "${var.project_id}.${google_bigquery_dataset.analytics.dataset_id}.${google_bigquery_table.events.table_id}"
}

output "pubsub_writer_binding_id" {
  description = "Id of the Pub/Sub service agent table binding; depend on it before creating the BigQuery subscription."
  value       = google_bigquery_table_iam_member.pubsub_writer.id
}
