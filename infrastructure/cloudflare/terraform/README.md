# Cloudflare zone as code

Terraform (provider `cloudflare/cloudflare ~> 5`) for the parts of the `orenjitrade.com` zone
that are safe to automate: DNS records, zone settings (TLS, HSTS, protocol features), Bot
Fight Mode, the apex redirect, cache rules, edge rate limits and WAF rules. The zone itself is
**not** created here — it already exists in the owner's account.

| File | Contents |
| --- | --- |
| `versions.tf` | provider constraint, partial GCS backend, provider block |
| `variables.tf` | zone id/name, LB addresses, extra records, email records, toggles |
| `main.tf` | records, `cloudflare_zone_setting`s, rulesets |
| `terraform.tfvars.example` | fictional example values |

## Usage

```bash
cd infrastructure/cloudflare/terraform
cp terraform.tfvars.example terraform.tfvars
export CLOUDFLARE_API_TOKEN=...      # zone-scoped token, never committed
terraform init -backend-config="bucket=<PROD_PROJECT_ID>-tfstate" -backend-config="prefix=cloudflare"
terraform plan
terraform apply
```

CI runs `terraform init -backend=false && terraform validate` on this directory.

Token permissions (create at Cloudflare dashboard > My Profile > API Tokens, scope to this
zone only): Zone Read, DNS Edit, Zone Settings Edit, Zone WAF Edit, Cache Rules Edit, Bot
Management Edit.

## Plan-dependent features

| Feature | Free | Pro+ | Here |
| --- | --- | --- | --- |
| Custom WAF rules | yes | yes | `waf_custom` |
| Rate limiting rules (`ip.src` + `cf.colo.id`, 10 s period) | 1 rule | more | `rate_limits` (3 rules; keep the most important one on Free) |
| Managed rulesets (Cloudflare Managed + OWASP) | no | yes | `enable_managed_waf = true` |
| Bot Fight Mode | yes | Super BFM | `bot_fight_mode` |

Everything else (SSL Full strict, Always Use HTTPS, HSTS, TLS 1.3, cache rules, redirects,
WebSockets) is available on every plan.

## Importing what already exists

If records or settings were created by hand first, import them instead of recreating:

```bash
terraform import cloudflare_dns_record.www <zone_id>/<record_id>
terraform import cloudflare_zone_setting.this[\"ssl\"] <zone_id>/ssl
```

Record ids: `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records" | jq '.result[] | {name,id}'`.
