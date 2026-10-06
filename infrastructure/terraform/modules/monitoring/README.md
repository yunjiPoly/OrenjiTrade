# module: monitoring

Uptime checks (api `/actuator/health/readiness`, web `/`), an email notification channel and
alert policies. Nothing here references Memorystore or a VPC connector: the low-cost profile
runs Redis as a sidecar and the Cloud Run saturation alerts are its scale-up signals (ADR 0016).

| Alert | Condition |
| --- | --- |
| uptime (api, web) | check failing from more than one region for 5 min |
| api 5xx ratio | 5xx / all requests > 2% over 5 min |
| api p95 latency | > 1500 ms over 5 min |
| api CPU utilisation | container CPU p99 > `api_cpu_threshold` (80%) for 10 min |
| api memory utilisation | container memory p99 > `api_memory_threshold` (85%) for 10 min |
| Cloud SQL CPU | > 80% for 5 min |
| Cloud SQL disk | > 80% for 15 min (auto-resize will grow it; the alert makes the growth visible) |
| Cloud SQL connections | backends > `sql_connection_threshold` (80% of the tier's `max_connections`: 40 on db-g1-small) |
| Pub/Sub backlog | oldest unacked message age > 10 min on any subscription |
| `payment_webhook_failed` | log-based metric counting `payment.webhook.failed` > 0 in 5 min (CRITICAL) |
| `notification_delivery_failed` | log-based metric counting `notification.delivery.failed` > 0 in 5 min (WARNING) |

| Input | Default |
| --- | --- |
| `environment` | — |
| `alert_email` | `null` (no channel) |
| `api_host`, `web_host`, `api_service_name`, `sql_database_id` | — |
| `error_ratio_threshold` | `0.02` |
| `p95_latency_threshold_ms` | `1500` |
| `api_cpu_threshold` / `api_memory_threshold` | `0.8` / `0.85` |
| `sql_cpu_threshold` / `sql_disk_threshold` | `0.8` / `0.8` |
| `sql_connection_threshold` | `40` |
| `pubsub_backlog_threshold_seconds` | `600` |
| `log_based_metrics` | the two markers above |

Outputs: `notification_channel_id` (also used by the billing budget), `uptime_check_ids`,
`alert_policy_names`, `log_based_metric_names`.

The API logs the markers as structured JSON (`jsonPayload.event = "payment.webhook.failed"`),
which the log filter matches alongside `message`/`textPayload`.
