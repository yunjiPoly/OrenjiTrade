# Cloudflare configuration for orenjitrade.com

Cloudflare sits in front of Google Cloud as registrar, DNS, CDN and WAF (CLAUDE.md "Edge").
The zone `orenjitrade.com` already exists in the owner's Cloudflare account; this document is
the complete step-by-step configuration. The automatable parts are also in
[`terraform/`](terraform/README.md) (`cloudflare/cloudflare ~> 5`); the dashboard steps below
match that code one to one so either path produces the same zone.

Prerequisites: `terraform output` of `infrastructure/terraform/environments/prod` (and
optionally dev/staging) for the load balancer IPs, and a zone-scoped API token if you use
Terraform.

Golden rule (CLAUDE.md): **never cache authenticated API responses.** Every step below that
touches caching exists to enforce it.

---

## 1. DNS records

Dashboard: **DNS > Records**. All application records are **proxied** (orange cloud) so
traffic goes through the WAF/CDN and the origin IP is never published.

| Type | Name | Content | Proxy | TTL | Purpose |
| --- | --- | --- | --- | --- | --- |
| A | `www` | `<PROD_LB_IPV4>` | Proxied | Auto | Web app + `/admin` |
| A | `api` | `<PROD_LB_IPV4>` | Proxied | Auto | REST `/api/v1/*` + WebSocket `/ws` |
| A | `@` (apex) | `192.0.2.1` | Proxied | Auto | Placeholder origin; a redirect rule (section 2) sends the apex to `https://www.orenjitrade.com`. `192.0.2.1` is TEST-NET-1 and is never contacted |
| AAAA | `www`, `api` | `<PROD_LB_IPV6>` | Proxied | Auto | Optional, only when `enable_ipv6 = true` in Terraform |
| A | `dev` | `<DEV_LB_IPV4>` | Proxied | Auto | Optional dev web |
| A | `dev-api` | `<DEV_LB_IPV4>` | Proxied | Auto | Optional dev API |
| A | `staging` | `<STAGING_LB_IPV4>` | Proxied | Auto | Optional staging web |
| A | `staging-api` | `<STAGING_LB_IPV4>` | Proxied | Auto | Optional staging API |
| TXT | `@` | `v=spf1 include:<PROVIDER_SPF> -all` | DNS only | 1 h | SPF for transactional email (`no-reply@orenjitrade.com`). Until a provider is chosen use `v=spf1 -all` |
| CNAME | `<selector>._domainkey` | `<PROVIDER_DKIM_TARGET>` | DNS only | 1 h | DKIM (value supplied by the email provider; SendGrid/SES give 1-3 CNAMEs) |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@<your-inbox>; adkim=s; aspf=s` | DNS only | 1 h | DMARC. Start with `p=none` while validating, move to `quarantine` then `reject` |
| MX | `@` | (none / provider) | DNS only | 1 h | Only if inbound mail is ever needed; otherwise add `v=spf1 -all` and no MX to make spoofing harder |

Notes:

- Email records must be **DNS only** (grey cloud); proxying them breaks mail.
- The Google-managed certificate on the load balancer covers `www.` and `api.` for prod and
  `dev*.`/`staging*.` in their environments. Records must exist (proxied is fine) before the
  certificate reaches `ACTIVE`; see `docs/deployment/README.md` step "verify certificates".
- Do not create records for `ml`: the ML service is internal-only on Cloud Run and has no
  public hostname.
- Never publish the LB IP in records that are not proxied; with Cloud Armor
  (`restrict_to_cloudflare = true`) direct hits are denied anyway.

## 2. Redirect rule: apex to www

Dashboard: **Rules > Redirect Rules > Create rule**.

| Field | Value |
| --- | --- |
| Name | `apex to www` |
| When incoming requests match | Custom filter expression: `(http.host eq "orenjitrade.com")` |
| Then | Dynamic redirect |
| Expression | `concat("https://www.orenjitrade.com", http.request.uri.path)` |
| Status code | `301` |
| Preserve query string | on |

Terraform: `cloudflare_ruleset.redirects` (phase `http_request_dynamic_redirect`).

## 3. SSL/TLS

Dashboard: **SSL/TLS**.

| Setting | Value | Why |
| --- | --- | --- |
| Overview > encryption mode | **Full (strict)** | Cloudflare validates the Google-managed certificate on the LB; anything weaker allows a MITM between edge and origin |
| Edge Certificates > Always Use HTTPS | On | 301 for any `http://` request at the edge |
| Edge Certificates > HTTP Strict Transport Security | Enable; max-age **12 months** (31536000), include subdomains **on**, preload **off** until submitted to hstspreload.org, no-sniff header **on** | Browsers refuse plain HTTP; start with a shorter max-age (e.g. 1 day) during the first week if you want a safety net |
| Edge Certificates > Minimum TLS version | **TLS 1.2** | Drop legacy clients |
| Edge Certificates > TLS 1.3 | On | |
| Edge Certificates > Automatic HTTPS Rewrites | On | |
| Edge Certificates > Opportunistic Encryption | On | |
| Edge Certificates > Certificate Transparency Monitoring | On | Email alerts when a certificate is issued for the domain |
| Origin Server > Authenticated Origin Pulls | Off for now | Cloud Armor allowlist (section 9) is the origin lock; AOP with a per-hostname certificate is a future hardening |

Terraform: `cloudflare_zone_setting.this["ssl"|"always_use_https"|"min_tls_version"|"tls_1_3"|...]`
and `cloudflare_zone_setting.hsts`.

## 4. Speed / protocol settings

Dashboard: **Speed > Optimization** and **Network**.

| Setting | Value | Why |
| --- | --- | --- |
| Brotli | On | |
| HTTP/3 (QUIC) | On | |
| 0-RTT Connection Resumption | **Off** | Replayable requests are unsafe for a stateful API |
| WebSockets (Network) | **On** | STOMP over WebSocket on `api.orenjitrade.com/ws`; Cloudflare proxies WebSockets on every plan, idle timeout is 100 s so the client sends heartbeats every 25 s |
| IPv6 Compatibility | On | |
| Rocket Loader | **Off** | Rewrites script tags and breaks Angular bootstrapping |
| Auto Minify / Mirage / Polish | Off | Assets are already optimised at build time; Polish would re-encode user images twice |
| Email Address Obfuscation | **Off** | Rewrites e-mail-like strings inside JSON responses |
| Always Online | Off | Never serve a stale application shell |

## 5. Cache rules

Dashboard: **Caching > Cache Rules**. Order matters; rules are evaluated top to bottom.

| # | Name | Expression | Action |
| --- | --- | --- | --- |
| 1 | `bypass api host` | `(http.host eq "api.orenjitrade.com")` | Cache eligibility: **Bypass cache** |
| 2 | `bypass authenticated` | `(any(http.request.headers.names[*] == "authorization")) or (http.cookie ne "")` | **Bypass cache** |
| 3 | `static assets www` | `(http.host eq "www.orenjitrade.com") and (http.request.uri.path.extension in {"js" "css" "woff" "woff2" "ttf" "png" "jpg" "jpeg" "webp" "avif" "gif" "svg" "ico" "webmanifest"})` | Eligible for cache; Edge TTL **Respect origin**; Browser TTL **Respect origin**; Cache key: ignore query string order; Cache deception armor on |
| 4 | `bypass app shell` | `(http.host eq "www.orenjitrade.com") and not (http.request.uri.path.extension in {...same set...})` | **Bypass cache** (index.html and Angular routes must change on every deploy) |

Also under **Caching > Configuration**: Caching level Standard, Browser Cache TTL "Respect
Existing Headers", Crawler Hints off, Always Online off. Do **not** use "Cache Everything"
page rules anywhere.

Origin headers the rules respect: nginx (web image) sends
`Cache-Control: public, max-age=31536000, immutable` for fingerprinted assets and
`Cache-Control: no-store` for `index.html`; the API sends `Cache-Control: no-store` on every
authenticated response and `private, max-age=0` on public ones, plus `Vary: Authorization`.

Terraform: `cloudflare_ruleset.cache` (phase `http_request_cache_settings`).

## 6. WAF

Dashboard: **Security > WAF**.

### 6.1 Managed rules (Pro plan or higher)

1. **Managed rules > Deploy managed ruleset > Cloudflare Managed Ruleset**: action *Managed
   Challenge* for the first two weeks (review Security > Events), then *Block*.
2. **Deploy > Cloudflare OWASP Core Ruleset**: paranoia level **PL1**, anomaly score threshold
   **Medium (40)**, action *Managed Challenge* initially, *Block* after tuning. Watch for false
   positives on card names with quotes/apostrophes in search queries and on message bodies;
   add an exception (skip specific rules) scoped to `starts_with(http.request.uri.path, "/api/v1/search")`
   rather than lowering the whole ruleset.
3. **Cloudflare Leaked Credentials Check**: On (adds `Exposed-Credential-Check` header the
   API can log).

Terraform: `cloudflare_ruleset.waf_managed` when `enable_managed_waf = true`.

### 6.2 Custom rules (all plans)

| Name | Expression | Action |
| --- | --- | --- |
| `block actuator` | `(http.host eq "api.orenjitrade.com") and starts_with(http.request.uri.path, "/actuator/") and not starts_with(http.request.uri.path, "/actuator/health")` | Block |
| `block api docs` | `(http.host eq "api.orenjitrade.com") and (starts_with(http.request.uri.path, "/swagger-ui") or starts_with(http.request.uri.path, "/v3/api-docs"))` | Block |
| `challenge admin from unexpected countries` (optional) | `(http.host eq "www.orenjitrade.com") and starts_with(http.request.uri.path, "/admin") and not (ip.geoip.country in {"CA" "US"})` | Managed Challenge |

Terraform: `cloudflare_ruleset.waf_custom`.

### 6.3 Rate limiting rules

Dashboard: **Security > WAF > Rate limiting rules**. Free plans allow one rule with the
characteristics `IP` + `Data center`, 10 s period and 10 s mitigation; Pro+ allow more rules
and periods. These edge limits are a coarse shield; the fine-grained per-user/route limits
are Redis token buckets in the API (`docs/security/README.md`).

| Name | Expression | Rate | Action |
| --- | --- | --- | --- |
| `auth` | `(http.host eq "api.orenjitrade.com") and (starts_with(http.request.uri.path, "/api/v1/auth") or http.request.uri.path eq "/api/v1/me")` | 20 req / 10 s per IP | Block 10 s |
| `messaging` | `(http.host eq "api.orenjitrade.com") and (http.request.method eq "POST") and (starts_with(http.request.uri.path, "/api/v1/conversations") or starts_with(http.request.uri.path, "/api/v1/community"))` | 20 req / 10 s per IP | Block 10 s |
| `search` | `(http.host eq "api.orenjitrade.com") and (starts_with(http.request.uri.path, "/api/v1/search") or starts_with(http.request.uri.path, "/api/v1/collectors/nearby") or starts_with(http.request.uri.path, "/api/v1/cards"))` | 60 req / 10 s per IP | Block 10 s |

If you are on Free, keep only `auth` at the edge and rely on the API buckets for the rest.
Note: Firebase sign-in itself talks to `identitytoolkit.googleapis.com`, not to our API; the
`auth` group protects session bootstrap, terms acceptance and profile provisioning.

Terraform: `cloudflare_ruleset.rate_limits` (phase `http_ratelimit`).

## 7. Bots and security level

Dashboard: **Security > Bots** and **Security > Settings**.

| Setting | Value | Notes |
| --- | --- | --- |
| Bot Fight Mode | **On** | Zone-wide. It can challenge non-browser clients; the Expo app uses the native fetch stack with a proper `User-Agent`, but if mobile requests to `api.*` start failing with `403`/challenge pages, either upgrade to Super Bot Fight Mode (Pro) where "definitely automated" can be set to *Allow* for the API host via WAF skip rules, or turn BFM off and rely on rate limits |
| Security Level | **Medium** | Challenges only high-threat IPs. Raise to *High* or *I'm Under Attack* during an incident (runbook) |
| Browser Integrity Check | On | Blocks requests with malformed/abusive headers |
| Challenge Passage | 30 min | |
| Replace insecure JS libraries | Off | Angular bundles its own |

Terraform: `cloudflare_bot_management.this`, `cloudflare_zone_setting.this["security_level"|"browser_check"]`.

## 8. Client IP handling in the API

Cloudflare terminates the client connection, so the API sees Cloudflare's IP as the peer and
the real client in `CF-Connecting-IP`. The API uses that header for rate limiting, audit logs
and abuse reports, but **only when the request really came from Cloudflare**:

1. The global LB adds `X-Forwarded-For: <client>, <cloudflare-edge>` and the Cloud Run
   instance sees the LB as the peer. Cloud Armor (section 9) guarantees the connection to the
   LB originated from a Cloudflare edge IP.
2. `TRUSTED_PROXY_HEADER=CF-Connecting-IP` (set by Terraform on the api service) tells the API
   to read that header. The API's `ClientIpResolver` accepts it **only if the immediate
   upstream address (last `X-Forwarded-For` hop) is inside the Cloudflare ranges** published
   at <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>; otherwise
   it falls back to the LB-provided client address and logs `security.untrusted_proxy_header`.
3. `X-Forwarded-Proto` is `https` end to end; Spring's `ForwardedHeaderFilter` is enabled for
   the LB hop only.
4. The same Cloudflare ranges are embedded as defaults in the Terraform `load-balancer` module
   (`cloudflare_ipv4_ranges`/`cloudflare_ipv6_ranges`). Refresh both places quarterly:

   ```bash
   curl -s https://www.cloudflare.com/ips-v4; echo; curl -s https://www.cloudflare.com/ips-v6
   ```

   then update the module defaults and the API's `cloudflare-ranges.txt` resource, run
   `terraform plan` in every environment and open a PR.

Never trust `X-Forwarded-For` alone, and never trust `CF-Connecting-IP` when
`restrict_to_cloudflare` is off (dev): in dev the API uses the LB-provided address.

## 9. Locking the origin to Cloudflare (Cloud Armor)

With `restrict_to_cloudflare = true` (staging, prod) the Terraform `load-balancer` module
attaches a Cloud Armor policy to both backend services that:

- allows the published Cloudflare IPv4 and IPv6 ranges (rules 1000+/2000+),
- allows `extra_allowed_ranges` (rule 3000) for uptime checkers or office egress if needed,
- denies everything else with 403 (default rule), and
- enables Adaptive Protection (L7 DDoS).

Cloud Monitoring uptime checks target the public hostnames through Cloudflare, so they keep
working. Anyone hitting the LB IP directly (or via a stray DNS-only record) receives 403.
Combined with Full (strict) TLS and the proxied-only records above, the origin cannot be
reached except through Cloudflare.

## 10. WebSocket support

- **Network > WebSockets: On** (section 4).
- The API terminates STOMP-over-WebSocket at `wss://api.orenjitrade.com/ws`. Cloudflare's
  idle timeout is 100 s; the Angular and Expo clients send STOMP heartbeats every 25 s.
- The Google LB backend timeout for `api` is 3600 s (`timeout_sec` in the `load-balancer`
  module) and the Cloud Run request timeout is 3600 s, so a single session lasts at most one
  hour before the client reconnects (the client library reconnects transparently; presence
  state lives in Redis, ADR 0003).
- Cache rule 1 (bypass `api.*`) and the `Authorization`/`Cookie` bypass keep the upgrade
  request out of the cache. WebSocket connections count against rate limits only at connect
  time.

## 11. Other zone hygiene

- **DNSSEC**: enable under DNS > Settings (Cloudflare Registrar publishes the DS record
  automatically).
- **Registrar**: lock the domain, enable auto-renew, WHOIS redaction on.
- **Notifications**: create alerts for "SSL/TLS certificate events", "Advanced DDoS attack
  alert", "Origin error rate", "Security events" to the on-call email.
- **Page Shield / Zaraz / Web Analytics**: optional; if Web Analytics is enabled, make sure the
  beacon only runs on `www` and never on `/admin`.
- **Scrape Shield**: Email Address Obfuscation off (section 4), Hotlink Protection off (signed
  URLs from GCS are already time-bound).

## 12. Verification checklist

Run after every zone change and after each production deploy. `<IP>` is the LB IPv4.

```bash
# DNS resolves through Cloudflare (returns Cloudflare edge IPs, never the LB IP)
dig +short www.orenjitrade.com A
dig +short api.orenjitrade.com A

# Apex redirects to www with 301 and keeps the path/query
curl -sI "https://orenjitrade.com/map?x=1" | grep -iE "^(HTTP|location)"

# HTTP redirects to HTTPS at the edge
curl -sI http://www.orenjitrade.com/ | grep -iE "^(HTTP|location)"

# TLS: 1.2 minimum, 1.3 offered, HSTS present
curl -sI https://www.orenjitrade.com/ | grep -i strict-transport-security
openssl s_client -connect www.orenjitrade.com:443 -tls1_1 </dev/null 2>&1 | grep -qi "alert" && echo "TLS 1.1 refused (good)"

# Cache: API and authenticated requests are never cached
curl -sI https://api.orenjitrade.com/api/v1/meta | grep -i cf-cache-status          # DYNAMIC
curl -sI -H "Authorization: Bearer x" https://www.orenjitrade.com/ | grep -i cf-cache-status   # DYNAMIC / BYPASS
# Static asset is cached (second request HIT), app shell is not
ASSET=$(curl -s https://www.orenjitrade.com/ | grep -oE 'main[^"]*\.js' | head -1)
curl -sI "https://www.orenjitrade.com/$ASSET" >/dev/null; curl -sI "https://www.orenjitrade.com/$ASSET" | grep -i cf-cache-status   # HIT
curl -sI https://www.orenjitrade.com/ | grep -i cf-cache-status                       # DYNAMIC

# Origin is locked: direct LB access is denied (staging/prod)
curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: api.orenjitrade.com" https://<IP>/api/v1/meta   # 403

# Operational endpoints blocked at the edge
curl -s -o /dev/null -w "%{http_code}\n" https://api.orenjitrade.com/actuator/env     # 403
curl -s -o /dev/null -w "%{http_code}\n" https://api.orenjitrade.com/actuator/health/readiness   # 200

# WebSocket upgrade succeeds
npx --yes wscat -c wss://api.orenjitrade.com/ws --no-color -x 'CONNECT\naccept-version:1.2\n\n\0' 2>&1 | head -3

# Rate limit trips (expect some 429s)
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " https://api.orenjitrade.com/api/v1/me; done; echo

# Client IP is the real one in API audit logs (compare with your egress IP)
curl -s https://api.orenjitrade.com/api/v1/meta | jq .clientIp
```

Then in the dashboard: Security > Events shows no false positives for normal traffic; Analytics
shows `api.*` requests as 100% uncached; SSL/TLS > Edge Certificates shows the universal
certificate active; the Google-managed certificate is `ACTIVE`
(`gcloud compute ssl-certificates describe <name> --global`).
