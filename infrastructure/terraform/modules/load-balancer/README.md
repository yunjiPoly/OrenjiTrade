# module: load-balancer

Global external Application Load Balancer with serverless NEGs for the `api` and `web` Cloud
Run services, a Google-managed certificate for the public hostnames, an HTTP to HTTPS
redirect, a `MODERN`/TLS 1.2+ SSL policy and an optional Cloud Armor policy that admits only
Cloudflare edge ranges (`restrict_to_cloudflare`).

| Input | Default | Notes |
| --- | --- | --- |
| `name` | — | `orenjitrade-<env>` |
| `backends` | — | `{ api = { cloud_run_service_name, hosts = ["api.orenjitrade.com"], timeout_sec = 3600 }, web = {...} }` |
| `default_backend` | `web` | |
| `enable_ipv6` | `false` | |
| `restrict_to_cloudflare` | `false` | `true` in staging/prod |
| `extra_allowed_ranges` | `[]` | up to 10 extra CIDRs |
| `cloudflare_ipv4_ranges` / `cloudflare_ipv6_ranges` | current published lists | refresh from cloudflare.com/ips |

Outputs: `ipv4_address`, `ipv6_address`, `certificate_name`, `certificate_domains`,
`backend_service_ids`, `url_map_name`, `security_policy_name`.

Managed certificates only become `ACTIVE` once DNS for every hostname resolves to the LB
address. With Cloudflare proxying, the first issuance requires the records to exist (proxied
is fine because Google validates over HTTP through the proxy). Verification steps are in
`docs/deployment/README.md`.

Cloud Monitoring uptime checks come from Google IPs; when `restrict_to_cloudflare` is on they
must target the public Cloudflare hostname (which they do), not the LB IP.
