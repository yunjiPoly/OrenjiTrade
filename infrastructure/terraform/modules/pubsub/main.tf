# Pub/Sub topics for the event-driven parts of OrenjiTrade (ADR 0009):
#   * every topic gets a dead-letter topic "<topic>-dlq" plus a pull subscription on the DLQ
#     so poisoned messages can be inspected and replayed
#   * push subscriptions deliver to Cloud Run endpoints with an OIDC token minted for a
#     dedicated service account (the receiving service verifies audience + email)
#   * BigQuery subscriptions stream analytics events straight into the warehouse table

locals {
  pubsub_service_agent = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_topic" "this" {
  for_each = toset(var.topics)

  project                    = var.project_id
  name                       = each.value
  message_retention_duration = var.message_retention_duration
  labels                     = var.labels

  message_storage_policy {
    allowed_persistence_regions = var.allowed_persistence_regions
  }
}

resource "google_pubsub_topic" "dead_letter" {
  for_each = toset(var.topics)

  project                    = var.project_id
  name                       = "${each.value}-dlq"
  message_retention_duration = var.dead_letter_retention_duration
  labels                     = merge(var.labels, { role = "dead-letter" })

  message_storage_policy {
    allowed_persistence_regions = var.allowed_persistence_regions
  }
}

# Pull subscription on every DLQ so nothing is silently lost.
resource "google_pubsub_subscription" "dead_letter_inspect" {
  for_each = toset(var.topics)

  project                    = var.project_id
  name                       = "${each.value}-dlq-inspect"
  topic                      = google_pubsub_topic.dead_letter[each.key].id
  ack_deadline_seconds       = 60
  message_retention_duration = var.dead_letter_retention_duration
  retain_acked_messages      = false
  labels                     = var.labels

  expiration_policy {
    ttl = "" # never expire
  }
}

# The Pub/Sub service agent must publish to DLQ topics on behalf of the source subscriptions.
resource "google_pubsub_topic_iam_member" "dead_letter_publisher" {
  for_each = toset(var.topics)

  project = var.project_id
  topic   = google_pubsub_topic.dead_letter[each.key].name
  role    = "roles/pubsub.publisher"
  member  = local.pubsub_service_agent
}

# Application publishers (the API runtime service account).
resource "google_pubsub_topic_iam_member" "publishers" {
  for_each = {
    for pair in setproduct(var.topics, var.publisher_members) :
    "${pair[0]}|${pair[1]}" => { topic = pair[0], member = pair[1] }
  }

  project = var.project_id
  topic   = google_pubsub_topic.this[each.value.topic].name
  role    = "roles/pubsub.publisher"
  member  = each.value.member
}

# ---------------------------------------------------------------------------------------
# Push subscriptions (Cloud Run endpoints, OIDC-authenticated)
# ---------------------------------------------------------------------------------------

resource "google_pubsub_subscription" "push" {
  for_each = var.push_subscriptions

  project                    = var.project_id
  name                       = each.key
  topic                      = google_pubsub_topic.this[each.value.topic].id
  ack_deadline_seconds       = each.value.ack_deadline_seconds
  message_retention_duration = var.message_retention_duration
  filter                     = each.value.filter
  labels                     = var.labels

  push_config {
    push_endpoint = each.value.push_endpoint

    oidc_token {
      service_account_email = each.value.oidc_service_account_email
      audience              = each.value.oidc_audience
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter[each.value.topic].id
    max_delivery_attempts = each.value.max_delivery_attempts
  }

  expiration_policy {
    ttl = ""
  }

  depends_on = [google_pubsub_topic_iam_member.dead_letter_publisher]
}

resource "google_pubsub_subscription_iam_member" "push_dead_letter_subscriber" {
  for_each = var.push_subscriptions

  project      = var.project_id
  subscription = google_pubsub_subscription.push[each.key].name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_service_agent
}

# ---------------------------------------------------------------------------------------
# BigQuery subscriptions (analytics warehouse)
# ---------------------------------------------------------------------------------------

resource "google_pubsub_subscription" "bigquery" {
  for_each = var.bigquery_subscriptions

  project                    = var.project_id
  name                       = each.key
  topic                      = google_pubsub_topic.this[each.value.topic].id
  ack_deadline_seconds       = 60
  message_retention_duration = var.message_retention_duration
  labels                     = var.labels

  bigquery_config {
    table               = each.value.table
    use_table_schema    = true
    write_metadata      = false
    drop_unknown_fields = true
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter[each.value.topic].id
    max_delivery_attempts = 10
  }

  expiration_policy {
    ttl = ""
  }

  depends_on = [google_pubsub_topic_iam_member.dead_letter_publisher]
}

resource "google_pubsub_subscription_iam_member" "bigquery_dead_letter_subscriber" {
  for_each = var.bigquery_subscriptions

  project      = var.project_id
  subscription = google_pubsub_subscription.bigquery[each.key].name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_service_agent
}
