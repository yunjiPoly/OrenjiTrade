# module: network

Creates the private network layer for one environment: custom VPC, a `/28` subnet for the
Serverless VPC Access connector (Private Google Access enabled), the Private Service Access
range + Service Networking peering used by Cloud SQL private IP and Memorystore, the
connector itself and an optional Cloud NAT.

Cloud Run services attach to `connector_id` and (for the API) route `ALL_TRAFFIC` through it
so that calls to the internal-only ML service stay on the VPC; Cloud NAT provides the public
egress those services still need (Stripe, external card catalogues).

| Input | Default | Notes |
| --- | --- | --- |
| `project_id` | — | |
| `region` | `northamerica-northeast1` | |
| `network_name` | `orenjitrade` | |
| `connector_name` | `orenjitrade-conn` | <= 25 chars |
| `connector_cidr` | `10.8.0.0/28` | must be a /28 |
| `connector_machine_type` | `e2-micro` | `e2-standard-4` for prod throughput |
| `connector_min_instances` / `connector_max_instances` | 2 / 3 | prod raises max |
| `private_service_access_prefix_length` | 16 | |
| `enable_cloud_nat` | `true` | |

Outputs: `network_id`, `network_name`, `network_self_link`, `connector_id`,
`connector_subnet_cidr`, `private_service_access_range_name`, `private_service_access_connection`.

Cloud SQL and Memorystore must `depends_on` this module so the peering exists first.
