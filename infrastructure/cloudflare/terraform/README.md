# Cloudflare zone as code

Terraform (provider `cloudflare/cloudflare ~> 5`) for the parts of the `orenjitrade.com` zone
that are safe to automate: DNS records (including the Certificate Manager `_acme-challenge`
CNAMEs), zone settings (TLS, HSTS, protocol features), Bot Fight Mode, the apex redirect,
cache rules, the edge rate limit and WAF rules. The zone itself is **not** created here — it
already exists in the owner's account. Everything fits the **Free plan** (ADR 0016).

| File | Contents |
| --- | --- |
| `versions.tf` | provider constraint, partial GCS backend, provider block |
| `variables.tf` | zone id/name, LB addresses, DNS authorizations, extra records, email records, toggles |
| `main.tf` | records, `cloudflare_zone_setting`s, rulesets |
| `terraform.tfvars.example` | fictional example values |

## Usage

```bash
cd infrastructure/cloudflare/terraform
cp terraform.tfvars.example terraform.tfvars
export CLOUDFLARE_API_TOKEN=...      # zone-scoped token, never committed
# from environments/prod: load_balancer_ipv4 and certificate_dns_authorizations outputs
terraform init -backend-config="bucket=<PROD_PROJECT_ID>-tfstate" -backend-config="prefix=cloudflare"
terraform plan
terraform apply
```

CI runs `terraform init -backend=false && terraform validate` on this directory.

Token permissions (create at Cloudflare dashboard > My Profile > API Tokens, scope to this
zone only): Zone Read, DNS Edit, Zone Settings Edit, Zone WAF Edit, Cache Rules Edit, Bot
Management Edit.

## TLS to the origin

`ssl = "strict"` (Full (strict)). The origin certificate is issued by Google Certificate
Manager through **DNS authorization**: each Google Cloud environment outputs one
`_acme-challenge.<host>` CNAME per hostname (`certificate_dns_authorizations`), created here
**DNS only** (`proxied = false`; a proxied CNAME is flattened to Cloudflare addresses and the
challenge never validates). The `www`/`api` A records stay proxied the whole time. Fallback:
a Cloudflare Origin CA certificate (`certificate_mode = "self_managed"` on the Google side),
which Full (strict) also accepts.

## Plan-dependent features (Cloudflare docs, checked 2026-10-05)

| Feature | Free | Pro+ | Here |
| --- | --- | --- | --- |
| Custom WAF rules | 5 | 20+ | `waf_custom` (2, or 3 with `block_internal_paths_at_edge`) |
| Cache rules | 10 | 25+ | `cache` (4 rules) |
| Rate limiting rules | **1** rule, 10 s period, 10 s mitigation, IP characteristic, expression fields limited to path and verified bot | 2+ rules, more periods | `rate_limits` (1 merged rule) |
| Managed rulesets (Cloudflare Managed + OWASP) | no | yes | `enable_managed_waf = true` |
| Bot Fight Mode | yes | Super BFM | `bot_fight_mode` |

Everything else (Universal SSL, Full (strict), Origin CA, Always Use HTTPS, HSTS, TLS 1.3,
redirects, WebSockets) is available on every plan.

### What the Free-plan rate limit dropped

The former three rules (`auth` 20/10 s, `messaging` POST-only 20/10 s, `search` 60/10 s)
became one rule over the union of their path prefixes (`rate_limit_path_prefixes`) at
`rate_limit_requests_per_10s` (60) per IP. Lost at the edge: the per-group thresholds (auth
and messaging were tighter), the `POST` restriction on messaging, and the `http.host`
scoping (the rule also matches `www`, which never serves those paths). All of them still
exist in the API: `orenji.ratelimit` in `apps/api/src/main/resources/application.yml`
(default 60/min per anonymous IP, 120/min per user, plus per-route policies in Redis). Public
image routes are excluded from the edge rule on purpose: a page loads dozens of card images and
cached hits still count towards the limit on Free (`requests_to_origin` is not available).

## Cache rules and origin headers (what the code really sends)

| Route | Origin `Cache-Control` | Edge |
| --- | --- | --- |
| `GET /api/v1/public/card-images/{id}` (cached artwork) | `public, max-age=31536000, immutable` + ETag (`CardImageController`) | cached (`public_images_api`) |
| same route, placeholder / provider redirect | `public, max-age=300` | cached 5 min |
| `GET /api/v1/public/placeholder-images/**` | `public, max-age=86400` | cached |
| `GET /api/v1/public/media/{key}` | `public, max-age=31536000, immutable` (`PublicMediaController`) | cached |
| every other API response (authenticated JSON, public JSON, errors) | `no-cache, no-store, max-age=0, must-revalidate` (Spring Security defaults; `ProblemDetailFactory` sets `no-store`) | bypassed (`bypass_api`) and uncacheable anyway (`no-store`) |
| `www` hashed assets (`main-XXXXXXXX.js`, ...) | `public, max-age=31536000, immutable` (nginx) | cached (`static_assets_www`) |
| `www` `index.html`, `config.json`, SPA routes | `no-cache, no-store, must-revalidate` (nginx) | bypassed (`bypass_app_shell`) |

Cloudflare never caches `no-store`/`private` responses or responses with `Set-Cookie`; a
request carrying an `Authorization` header is cached only when the response says `public`,
`s-maxage` or `must-revalidate` (Origin Cache Control), which only the image routes do. The
rule expressions are mutually exclusive, so the result does not depend on rule order.

## Importing what already exists

If records or settings were created by hand first, import them instead of recreating:

```bash
terraform import cloudflare_dns_record.www <zone_id>/<record_id>
terraform import cloudflare_zone_setting.this[\"ssl\"] <zone_id>/ssl
```

Record ids: `curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records" | jq '.result[] | {name,id}'`.
