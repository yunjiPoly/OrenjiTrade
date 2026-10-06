# module: network

Creates the private network layer for one environment: custom VPC, the Private Service Access
range + Service Networking peering used by Cloud SQL private IP (and Memorystore on the
scale-up path), and, depending on the toggles:

- **Direct VPC egress** (`direct_vpc_subnet_cidr`, the low-cost default): a `/24` subnet with
  Private Google Access that Cloud Run instances draw their IPs from. No connector VMs, no
  compute charge (Cloud Run docs: Direct VPC egress needs a `/26` or larger; it reserves IPs
  in `/28` blocks and uses about 2x the instance count). Services use
  `vpc_egress = "PRIVATE_RANGES_ONLY"`: Cloud SQL's private IP goes through the VPC, public
  calls (Firebase, Stripe, card providers) go straight out, so no Cloud NAT is needed.
- **Serverless VPC Access connector** (`enable_connector`, legacy path, billed as e2-micro
  VMs) with its own `/28` subnet, for services that need `ALL_TRAFFIC` egress (reaching the
  internal-only ML service when it returns).
- **Cloud NAT** (`enable_cloud_nat`): public egress for `ALL_TRAFFIC` services only.

| Input | Default | Notes |
| --- | --- | --- |
| `project_id` | — | |
| `region` | `northamerica-northeast1` | |
| `network_name` | `orenjitrade` | |
| `direct_vpc_subnet_cidr` | `null` | environments pass `10.9.0.0/24` |
| `enable_connector` | `true` | environments pass `false` (Direct VPC egress) |
| `connector_name` | `orenjitrade-conn` | <= 25 chars |
| `connector_cidr` | `10.8.0.0/28` | must be a /28 |
| `connector_machine_type` | `e2-micro` | `e2-standard-4` for prod throughput |
| `connector_min_instances` / `connector_max_instances` | 2 / 3 | |
| `private_service_access_prefix_length` | 16 | |
| `enable_cloud_nat` | `true` | environments pass `false` |

Outputs: `network_id`, `network_name`, `network_self_link`, `direct_vpc_subnet_name`,
`direct_vpc_subnet_id`, `direct_vpc_subnet_cidr`, `connector_id` (null when disabled),
`connector_subnet_cidr`, `private_service_access_range_name`,
`private_service_access_connection`.

Cloud SQL and Memorystore must `depends_on` this module so the peering exists first.
