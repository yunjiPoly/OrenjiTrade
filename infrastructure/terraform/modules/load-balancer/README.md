# module: load-balancer

Global external Application Load Balancer with serverless NEGs for the `api` and `web` Cloud
Run services, a certificate for the public hostnames, an HTTP to HTTPS redirect, a
`MODERN`/TLS 1.2+ SSL policy and an optional Cloud Armor policy that admits only Cloudflare
edge ranges (`restrict_to_cloudflare`).

| Input | Default | Notes |
| --- | --- | --- |
| `name` | — | `orenjitrade-<env>` |
| `backends` | — | `{ api = { cloud_run_service_name, hosts = ["api.orenjitrade.com"], timeout_sec = 3600 }, web = {...} }` |
| `default_backend` | `web` | |
| `certificate_mode` | `certificate_manager` | `compute_managed` or `self_managed` (see below) |
| `self_managed_certificate` | `null` | `{ certificate_pem, private_key_pem }` for `self_managed`, sensitive |
| `enable_ipv6` | `false` | |
| `restrict_to_cloudflare` | `false` | `true` in staging/prod |
| `extra_allowed_ranges` | `[]` | up to 10 extra CIDRs |
| `cloudflare_ipv4_ranges` / `cloudflare_ipv6_ranges` | current published lists | refresh from cloudflare.com/ips |

Outputs: `ipv4_address`, `ipv6_address`, `certificate_mode`, `certificate_name`,
`certificate_domains`, `certificate_map_name`, `dns_authorization_records`,
`backend_service_ids`, `url_map_name`, `security_policy_name`.

## Certificate modes

| Mode | How it is issued | When to use |
| --- | --- | --- |
| `certificate_manager` (default) | Certificate Manager, Google-managed, **DNS authorization**: one `google_certificate_manager_dns_authorization` per hostname exposes a `_acme-challenge.<host>` CNAME (`dns_authorization_records` output). Create the records **DNS only (not proxied)** in Cloudflare (`certificate_dns_authorizations` in `infrastructure/cloudflare/terraform`); the certificate then moves `AUTHORIZING` -> `ACTIVE` and is attached to the HTTPS proxy through a certificate map. The `www`/`api` records can stay proxied the whole time. First 100 certificates per month are free (Certificate Manager pricing). | Cloudflare proxies the hostnames (our setup) |
| `compute_managed` | Classic `google_compute_managed_ssl_certificate` (HTTP validation through the public hostname). It cannot be issued while Cloudflare proxies the hostnames (Google never sees the LB IP behind the proxy). | Hostnames resolve directly to the LB |
| `self_managed` | `google_compute_ssl_certificate` from operator-supplied PEM, e.g. a Cloudflare **Origin CA** certificate (trusted by Cloudflare's edge only, valid up to 15 years). Keep the key in a git-ignored `terraform.tfvars` or read it from Secret Manager in the environment root (`origin_certificate_secret_ids`). | Fallback if DNS authorization cannot be completed |

All three keep Cloudflare on **Full (strict)**: a public CA certificate or an Origin CA
certificate both satisfy strict origin validation.

Checking the Certificate Manager state:

```bash
gcloud certificate-manager certificates describe <certificate_name> --format 'yaml(managed.state,managed.authorizationAttemptInfo)'
gcloud certificate-manager dns-authorizations list --format 'table(name,domain,dnsResourceRecord.name,dnsResourceRecord.data)'
```

If the zone carries CAA records, they must allow `pki.goog` (and `letsencrypt.org`); the
zone has none by default.

Cloud Monitoring uptime checks come from Google IPs; when `restrict_to_cloudflare` is on they
must target the public Cloudflare hostname (which they do), not the LB IP.
