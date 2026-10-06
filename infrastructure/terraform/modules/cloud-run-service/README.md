# module: cloud-run-service

Generic Cloud Run v2 service used for `api`, `web` (and `ml` when it is enabled). Terraform
manages resources, scaling, VPC access, ingress, env vars, Secret Manager env refs, probes,
sidecars and IAM; the main container image is ignored after the first apply because
`.github/workflows/deploy.yml` rolls out images (`gcloud run services update --container <name>
--image ...`). Sidecar images stay Terraform-managed and must be pinned (never `:latest`).

| Input | Default | Notes |
| --- | --- | --- |
| `name` | — | `orenjitrade-<service>-<env>` |
| `container_name` | `name` | main container name; `api` / `web` in the environments (deploy.yml targets it) |
| `image` | Cloud Run hello image | placeholder for the first apply only |
| `service_account_email` | — | |
| `ingress` | `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` | ml uses `INGRESS_TRAFFIC_INTERNAL_ONLY` |
| `execution_environment` | `EXECUTION_ENVIRONMENT_GEN2` | GEN2 needs >= 512Mi per container |
| `container_port` | `8080` | |
| `cpu` / `memory` | `1` / `512Mi` | fractions (0.08-0.99) allowed; instance total must stay >= 1 vCPU under instance-based billing |
| `cpu_idle` | `true` | `false` for the API (WebSockets, outbox workers): instance-based billing for every container |
| `min_instances` / `max_instances` | `0` / `3` | prod api: 1 / 1 (localhost Redis sidecar cannot fan out across instances) |
| `concurrency` | `80` | |
| `request_timeout_seconds` | `300` | api: 3600 for WebSockets |
| `vpc_connector_id` / `vpc_egress` | `null` / `PRIVATE_RANGES_ONLY` | Serverless VPC Access connector (legacy path) |
| `vpc_network` / `vpc_subnetwork` / `vpc_network_tags` | `null` | Direct VPC egress (no connector VMs); mutually exclusive with the connector |
| `env` | `{}` | plain values |
| `secret_env` | `{}` | `NAME => { secret, version }` |
| `startup_probe` / `liveness_probe` | `/` / none | api: `/actuator/health/readiness` + `/actuator/health/liveness` |
| `sidecars` | `[]` | `{ name, image, cpu, memory, command, args, env, startup_probe { tcp_port | http_path + http_port }, volume_mounts }`; the main container `depends_on` every sidecar |
| `volumes` / `volume_mounts` | `[]` | in-memory `empty_dir` volumes (count against instance memory) |
| `allow_unauthenticated` | `false` | `true` behind the external LB |
| `invoker_members` | `[]` | scheduler SA, pubsub-push SA |
| `custom_audiences` | `[]` | `https://api.<domain>` so OIDC tokens minted for the public URL validate |

Outputs: `name`, `id`, `uri`, `location`, `latest_ready_revision`, `container_name`,
`sidecar_names`.

Sidecar rules (Cloud Run docs, "Deploying sidecars" and "Configure containers"): only the
ingress container has a port; containers share the network namespace (`localhost`); a
container that `depends_on` another is started only after that container's startup probe
passes, so every sidecar needs a probe (TCP on its port is enough); with startup CPU boost all
containers receive the boost; the instance is billed for the sum of the containers' CPU and
memory limits.
