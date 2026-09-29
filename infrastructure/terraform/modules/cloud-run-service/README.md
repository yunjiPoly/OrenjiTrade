# module: cloud-run-service

Generic Cloud Run v2 service used for `api`, `web` and `ml`. Terraform manages resources,
scaling, VPC access, ingress, env vars, Secret Manager env refs, probes and IAM; the container
image is ignored after the first apply because `.github/workflows/deploy.yml` rolls out images.

| Input | Default | Notes |
| --- | --- | --- |
| `name` | — | `orenjitrade-<service>-<env>` |
| `image` | Cloud Run hello image | placeholder for the first apply only |
| `service_account_email` | — | |
| `ingress` | `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` | ml uses `INGRESS_TRAFFIC_INTERNAL_ONLY` |
| `container_port` | `8080` | |
| `cpu` / `memory` | `1` / `512Mi` | |
| `cpu_idle` | `true` | `false` for the API (WebSockets, outbox workers) |
| `min_instances` / `max_instances` | `0` / `3` | prod api: 1 / 20 |
| `concurrency` | `80` | |
| `request_timeout_seconds` | `300` | api: 3600 for WebSockets |
| `vpc_connector_id` / `vpc_egress` | `null` / `PRIVATE_RANGES_ONLY` | api: `ALL_TRAFFIC` |
| `env` | `{}` | plain values |
| `secret_env` | `{}` | `NAME => { secret, version }` |
| `startup_probe` / `liveness_probe` | `/` / none | api: `/actuator/health/readiness` + `/actuator/health/liveness` |
| `allow_unauthenticated` | `false` | `true` behind the external LB |
| `invoker_members` | `[]` | scheduler SA, pubsub-push SA |
| `custom_audiences` | `[]` | `https://api.<domain>` so OIDC tokens minted for the public URL validate |

Outputs: `name`, `id`, `uri`, `location`, `latest_ready_revision`.
