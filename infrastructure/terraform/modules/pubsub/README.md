# module: pubsub

Topics `domain-events`, `analytics-events`, `card-scan-requests` (configurable), each with a
`<topic>-dlq` dead-letter topic and a `<topic>-dlq-inspect` pull subscription. Push
subscriptions deliver to Cloud Run with an OIDC token; BigQuery subscriptions stream into the
analytics table. IAM for the Pub/Sub service agent (publish to DLQ, subscribe on sources) is
handled here; the BigQuery table grant lives in the `bigquery` module.

| Input | Default | Notes |
| --- | --- | --- |
| `project_id`, `project_number` | — | |
| `topics` | the three OrenjiTrade topics | |
| `publisher_members` | `[]` | API runtime SA |
| `push_subscriptions` | `{}` | `{ topic, push_endpoint, oidc_service_account_email, oidc_audience?, ack_deadline_seconds?, max_delivery_attempts?, filter? }` |
| `bigquery_subscriptions` | `{}` | `{ topic, table = "project.dataset.table" }` |
| `allowed_persistence_regions` | `["northamerica-northeast1"]` | |

Outputs: `topic_ids`, `topic_names`, `dead_letter_topic_ids`, `push_subscription_names`,
`bigquery_subscription_names`, `dead_letter_inspect_subscription_names`.

Draining a backlog / replaying a DLQ: `docs/deployment/runbooks.md`.
