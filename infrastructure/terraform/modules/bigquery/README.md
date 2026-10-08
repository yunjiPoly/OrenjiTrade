# module: bigquery

Dataset `orenjitrade_analytics` and table `events` with the fixed analytics schema
(`event_id`, `event_type`, `event_version`, `occurred_at TIMESTAMP`, `actor_hash`,
`region_code`, `subdivision_code`, `payload JSON`), partitioned by day on `occurred_at` and clustered
by `event_type`. Grants the Pub/Sub service agent `bigquery.dataEditor` on the table and
`bigquery.metadataViewer` on the dataset so a BigQuery subscription can write.

| Input | Default | Notes |
| --- | --- | --- |
| `project_id`, `project_number` | — | |
| `dataset_id` | `orenjitrade_analytics` | |
| `events_table_id` | `events` | |
| `location` | `northamerica-northeast1` | |
| `deletion_protection` | `false` | prod: `true` |
| `partition_expiration_days` | `null` | dev: 90 |
| `reader_members` | `[]` | analyst group |

Outputs: `dataset_id`, `events_table_id`, `events_table_reference`, `pubsub_writer_binding_id`.

The `pubsub` module must `depends_on` this module so the IAM grant exists before the
BigQuery subscription is created.
