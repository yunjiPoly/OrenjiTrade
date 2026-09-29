# module: monitoring

Uptime checks (api `/actuator/health/readiness`, web `/`), an email notification channel and
alert policies:

| Alert | Condition |
| --- | --- |
| uptime (api, web) | check failing from more than one region for 5 min |
| api 5xx ratio | 5xx / all requests > 2% over 5 min |
| api p95 latency | > 1500 ms over 5 min |
| Cloud SQL CPU | > 80% for 5 min |
| Cloud SQL connections | backends > `sql_connection_threshold` (80% of tier max) |
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
| `sql_cpu_threshold` | `0.8` |
| `sql_connection_threshold` | `80` |
| `pubsub_backlog_threshold_seconds` | `600` |
| `log_based_metrics` | the two markers above |

Outputs: `notification_channel_id`, `uptime_check_ids`, `alert_policy_names`, `log_based_metric_names`.

The API logs the markers as structured JSON (`jsonPayload.event = "payment.webhook.failed"`),
which the log filter matches alongside `message`/`textPayload`.
