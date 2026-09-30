output "topic_ids" {
  description = "Map topic name => full topic id."
  value       = { for k, t in google_pubsub_topic.this : k => t.id }
}

output "topic_names" {
  description = "List of topic names."
  value       = [for t in google_pubsub_topic.this : t.name]
}

output "dead_letter_topic_ids" {
  description = "Map topic name => dead-letter topic id."
  value       = { for k, t in google_pubsub_topic.dead_letter : k => t.id }
}

output "push_subscription_names" {
  description = "Names of the push subscriptions."
  value       = [for s in google_pubsub_subscription.push : s.name]
}

output "bigquery_subscription_names" {
  description = "Names of the BigQuery subscriptions."
  value       = [for s in google_pubsub_subscription.bigquery : s.name]
}

output "dead_letter_inspect_subscription_names" {
  description = "Pull subscriptions on the DLQs (use with gcloud pubsub subscriptions pull)."
  value       = [for s in google_pubsub_subscription.dead_letter_inspect : s.name]
}
