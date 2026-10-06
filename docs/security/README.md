# Security

Security posture of OrenjiTrade: what we protect, against whom, and which controls exist or
are planned. This complements `CLAUDE.md` (the location-privacy rule that overrides everything
else), ADR 0004 (location privacy), ADR 0008 (identity), ADR 0011 (payments) and the
deployment docs. Status legend: **done** = implemented and tested, **infra** = provided by the
Terraform/Cloudflare configuration in this repository, **planned** = scheduled phase in
`IMPLEMENTATION_STATUS.md`.

## 1. Threat model summary

Assets, ranked: (1) collectors' real-world location and identity, (2) private messages,
(3) account takeover, (4) payment integrity, (5) catalogue/inventory integrity, (6) availability.

| # | Threat | Actor | Impact | Primary controls | Status |
| --- | --- | --- | --- | --- | --- |
| T1 | Re-identify a collector's home from map data (triangulation, precise coordinates leaking in any response, logs or analytics) | Curious/abusive user, scraper | Physical safety | Server-derived `public_point` on a 1 km grid with deterministic HMAC jitter; distances bucketed; DTOs never touch `home_point`; `GeoPrivacyContractTest` rejects > 3 decimals in any JSON; analytics carry only grid cell + region label; discoverability opt-in | planned (Phase 1/4, tests required) |
| T2 | Account takeover (credential stuffing, token theft, session fixation) | External attacker | Data exposure, fraud | Firebase/Identity Platform handles passwords, verification, reset and OAuth; API only verifies ID tokens (1 h, cached certs); MFA mandatory for admin/moderator; edge + Redis rate limits on auth endpoints; no long-lived API keys for users | planned (Phase 1); MFA planned (Phase 7) |
| T3 | Broken authorization (IDOR on binders, messages, offers; role escalation) | Authenticated user | Privacy breach | Actor derived from token never from body; `@PreAuthorize` + ownership checks in services; roles in `user_role` only editable by SUPER_ADMIN via audited admin endpoints; integration tests per module | planned (every module) |
| T4 | Injection (SQL, NoSQL-like JSONB, log, header) | Attacker | Data breach | JPA/parameterised SQL only; PostGIS functions receive typed parameters; strict DTO validation (Bean Validation); JSON logging with escaped fields; Cloudflare WAF managed rules + OWASP CRS | planned (code), infra (WAF) |
| T5 | Malicious uploads (polyglot images, oversized files, SVG scripts, EXIF GPS leaking home location) | Attacker, careless user | XSS, RCE in image libs, location leak | Section 5 upload rules: allow-list of types by magic bytes, size caps, mandatory server-side re-encode that strips metadata, signed URLs, private bucket, `Content-Disposition` and `X-Content-Type-Options` | planned (Phase 3/13) |
| T6 | Abuse: spam messages, harassment, fake listings, scraping the catalogue/collectors | Malicious users, bots | Trust, cost | Rate limits per user/IP/route; block/report flows; moderation queue; Bot Fight Mode; freshness/delisting of stale listings; report reasons required | planned (Phase 5/7), infra (edge) |
| T7 | Payment fraud / webhook forgery / replay | Attacker | Financial loss | Stripe Connect destination charges; webhook signature verification + idempotency table; no card data ever touches our servers; feature-flagged; manual payout release | planned (Phase 9) |
| T8 | Secret leakage (keys in git, CI logs, bundles) | Insider mistake, supply chain | Full compromise | No SA keys (WIF/OIDC); Secret Manager with per-secret IAM; Trivy secret scanning in CI; `.gitignore` for `.env`/keys/tfvars; frontends receive public keys only | infra/done |
| T9 | Supply chain (compromised dependency or action) | External | RCE | Pinned versions, Dependabot weekly grouped updates, Trivy/`npm audit`/`pip-audit` gates, CodeQL weekly, GitHub Actions pinned to major tags (move to SHA pins in Phase 13) | infra |
| T10 | Denial of service / cost attack on Cloud Run | Bots | Availability, bill | Cloudflare in front (Cloud Armor admits only Cloudflare ranges), rate limits, `max_instances` caps, Adaptive Protection, budget alerts | infra |
| T11 | Bypassing Cloudflare by hitting the origin IP | Attacker | WAF bypass | Cloud Armor allow-list of Cloudflare IPs, proxied-only DNS, Full (strict) TLS, `CF-Connecting-IP` trusted only from Cloudflare ranges | infra |
| T12 | Insider / operator error (dropping prod DB, exporting PII) | Staff | Data loss, privacy | Deletion protection, PITR, least-privilege SAs, audit log of admin actions, separate projects per env, data classification + handling rules (section 3) | infra/planned |
| T13 | Internal endpoints (`/internal/jobs/*`, `/internal/events/pubsub`) invoked by outsiders | Attacker | Job abuse, fake events | Google-signed OIDC token required: issuer `accounts.google.com`, audience `https://api.<domain>` (jobs) or Cloud Run URL (push), `email` must equal the scheduler / pubsub-push SA; `/actuator/*` except health blocked at the edge | planned (API), infra |

Out of scope for the MVP threat model: nation-state adversaries, physical security of Google
data centres (covered by Google's compliance), mobile OS compromise.

## 2. OWASP ASVS (v4.0.3, level 2) mapping

| ASVS chapter | Requirement (abridged) | Implementation | Status |
| --- | --- | --- | --- |
| V1 Architecture | Trust boundaries, component inventory, secrets outside code | `ARCHITECTURE.md`, modular monolith with module boundaries, Secret Manager, WIF | done (docs), infra |
| V2 Authentication | No home-grown passwords, MFA for privileged, brute-force protection, secure reset | Firebase/Identity Platform (email verification, reset, Google/Apple OAuth), TOTP/SMS MFA for admins, rate limits at edge + Redis | planned |
| V3 Session management | Short-lived tokens, revocation, logout invalidates | Firebase ID tokens (1 h) + refresh tokens; revocation via Admin SDK `revokeRefreshTokens`; API is stateless; WebSocket sessions authenticated with the same token at CONNECT and re-validated hourly | planned |
| V4 Access control | Deny by default, server-side enforcement, IDOR protection, admin separation | Spring Security deny-all default, `@PreAuthorize` + ownership checks, roles in DB, `/admin` requires ADMIN + recent second factor, cursor pagination without guessable ids (UUIDv7) | planned |
| V5 Validation & encoding | Input validation, output encoding, injection prevention | Bean Validation on every DTO, JPA parameters, Jackson strict mode (unknown properties rejected), Angular's built-in sanitisation, no `innerHTML` with user data, CSP on `www` | planned |
| V6 Cryptography | Approved algorithms, key management | TLS 1.2+/1.3 everywhere, Cloud SQL encryption at rest (Google-managed keys), HMAC-SHA256 for jitter seed with a Secret Manager key, `pgcrypto` for `home_point` column encryption, no custom crypto | infra/planned |
| V7 Error handling & logging | No stack traces to clients, logs without secrets/PII, tamper-evident audit | RFC 9457 Problem Details with `errorCode` + `requestId`, JSON logs with hashed user ids, `audit_log` append-only, Cloud Logging retention 30 d (400 d for audit sink) | planned |
| V8 Data protection | Classification, minimisation, secure deletion | Section 3; account deletion job anonymises and removes; `tmp/` uploads purged in 2 days; analytics without PII | planned |
| V9 Communications | TLS, HSTS, certificate validation | Cloudflare Full (strict), HSTS 1 year, Google-managed certs, `MODERN` SSL policy on the LB, `sslmode=require` to Cloud SQL | infra |
| V10 Malicious code | Dependency integrity, no backdoors | Dependabot, Trivy, CodeQL, review required on `main`, WIF instead of keys | infra |
| V11 Business logic | Anti-automation, sequencing, limits | Offer/trade state machines with authorization per transition, freemium limits as data (ADR 0014), rate limits, dedup keys on notifications | planned |
| V12 Files & resources | Upload validation, no path traversal, private storage | Section 5 | planned |
| V13 API & web services | Auth on every endpoint, JSON schema validation, CORS allow-list | Bearer token filter, OpenAPI generated from code and used to generate clients, CORS only for `https://www.<domain>` + dev origins, `X-Request-Id` on every request | planned |
| V14 Configuration | Hardened defaults, no debug in prod, security headers, dependency inventory | Swagger only in `local`, actuator limited to health, headers (`CSP`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` for geolocation/camera) served by nginx and API, Terraform-managed config | infra/planned |

## 3. Data classification

| Class | Examples | Storage | Access | Logging/analytics | Retention |
| --- | --- | --- | --- | --- | --- |
| **Restricted – location** (ADR 0004) | `user_location.home_point`, `trading_area_center`, `trading_area_radius_m`, device GPS in requests | Cloud SQL, column encrypted (`pgcrypto`), private IP only | `location` module only; never in DTOs, exports, admin screens or seed screenshots | **Never** logged or sent to analytics; grid cell/region label only | Until user changes area or deletes account |
| **Restricted – secrets** | DB password, Stripe keys, service token, signing keys | Secret Manager | Runtime SAs by secret; operators via IAM with audit | Never | Rotated per runbook |
| **Confidential – personal data** | email, display name, avatar, messages, offers, ratings, reports, IP addresses, audit log actor | Cloud SQL, GCS media | Owner + counterpart (messages) + moderators/admins with reason | Logs use `userId` hash and `requestId`; message bodies never logged; analytics `actor_hash` = HMAC(user id) | Account lifetime; deletion job anonymises within 30 days; audit log 7 years |
| **Confidential – payments** | Stripe customer/account ids, transaction amounts, payout state, dispute evidence | Cloud SQL (ids only), Stripe (card data) | Parties + admins | Amounts may be logged, ids partially masked | Legal retention (7 years Canada) |
| **Internal** | Inventory items (private binders), wishlists, feature flags, plan config | Cloud SQL | Owner; admins | Counts only | Lifetime |
| **Public** | Public binders, `public_point`, `public_label`, card catalogue, community messages | Cloud SQL, CDN cacheable where unauthenticated | Everyone (rate limited) | Freely | Lifetime / until unpublished |

Rules: `public_point` is the **only** location representation allowed outside the `location`
module; coordinates in responses have at most 3 decimals; distances are bucketed. Any new geo
endpoint adds a `GeoPrivacyContractTest` case. Exports for support/legal go through an admin
action that is audited and excludes Restricted-location columns.

## 4. Secrets policy

- **Where**: Google Secret Manager only, one project per environment. Terraform creates the
  containers and per-secret `secretAccessor` bindings; values are added by Terraform
  (generated) or by an operator with `gcloud secrets versions add` — never through tfvars,
  git, chat or CI logs. `version_destroy_ttl` keeps destroyed versions recoverable for 7 days.
- **Who**: runtime service accounts get access to exactly the secrets they need
  (`api-run`: db-password, redis-url, service-token, stripe-*; `ml-run`: service-token). No
  project-wide `secretmanager.secretAccessor`.
- **CI/CD**: GitHub Actions authenticates with **Workload Identity Federation** (OIDC) to the
  `github-deployer` SA; the provider trusts only `assertion.repository == "<owner/repo>"` (and
  only `refs/heads/main` for prod). **No service-account keys are created, downloaded or stored
  in GitHub secrets.** GitHub repository/environment *variables* hold only non-secret ids.
- **Frontends**: bundles may contain public keys only (Firebase web config, referrer-restricted
  Maps browser key, Stripe publishable key). A CI grep for `sk_live`, `-----BEGIN` and
  `AIza` in built bundles is part of Phase 13.
- **Local**: `.env` (git-ignored) copied from `.env.example`; emulators and fake providers mean
  no real key is needed for development.
- **Rotation**: generated secrets yearly or on suspicion (runbook 3); Stripe keys per Stripe
  guidance; immediately on any exposure. Every rotation is a logged change.
- **Detection**: Trivy secret scanner on every PR; GitHub push protection enabled on the repo.

## 5. Upload validation rules

Applies to avatars, card photos, binder covers and scan inputs (ML). Uploads go directly to
GCS through V4 signed URLs issued by the API; the API validates on the server before an
object becomes referenced.

| Rule | Value |
| --- | --- |
| Allowed content types | `image/jpeg`, `image/png`, `image/webp`, `image/heic` (mobile camera). No SVG, GIF, PDF, video |
| Detection | By magic bytes on the server (`ImageIO`/`libvips` probe), never by extension or client header; mismatch -> reject `UPLOAD_TYPE_MISMATCH` |
| Max size | avatar 5 MB, card photo 12 MB, scan input 12 MB; enforced in the signed URL (`x-goog-content-length-range`) and re-checked on confirm |
| Dimensions | min 64×64, max 8000×8000 px; pixel-bomb check (decoded size cap 80 MP) |
| Re-encoding | Every accepted image is decoded and re-encoded server-side to WebP (and JPEG fallback) at fixed variants (avatar 256/512, card 800/1600); **all metadata (EXIF, GPS, XMP, ICC beyond sRGB) is stripped**; the original upload is deleted |
| Storage layout | `tmp/<uuid>` for unconfirmed uploads (auto-deleted after 2 days) -> `users/<id>/...` or `inventory/<item id>/...` once confirmed |
| Access | Bucket has public access prevention; reads use short-lived signed URLs (15 min) or the API streams with `Cache-Control: private`; `Content-Disposition: inline; filename="<uuid>.webp"`; `X-Content-Type-Options: nosniff` |
| Rate limits | 30 upload URLs per user per hour; 200 MB per user per day (plan-dependent, ADR 0014) |
| Scanning | Card photos sent to the ML service are processed in memory; the ML service never writes originals; moderation hooks flag reported images for review |
| Client hints | Web/mobile compress client-side before upload to reduce size, but server rules are authoritative |

## 6. Rate-limiting plan

Two layers: coarse edge limits in Cloudflare (`infrastructure/cloudflare/README.md` section 6.3)
and precise application limits in the API's `RateLimitFilter` backed by Redis **token
buckets** (`Lua` script for atomic take/refill, key TTL = window).

| Scope | Key | Default budget (configurable in `usage_limit`, ADR 0014) |
| --- | --- | --- |
| Per IP (anonymous) | `rl:ip:<ip>:<route-group>` | 120 req/min default (`RATE_LIMIT_DEFAULT_PER_MINUTE`), 20 req/min for auth routes |
| Per user | `rl:user:<id>:<route-group>` | 600 req/min general; premium plans higher |
| Route groups | `auth`, `search` (search, nearby, cards), `messaging` (send message, create conversation, community post), `uploads`, `offers`, `reports`, `admin` | search 60/min, messaging 30/min + 200/day, uploads 30/h, offers 20/h, reports 10/day |
| WebSocket | connect attempts 10/min per user; outbound STOMP frames 60/min per session | |
| Notifications | dedup key type+subject+recipient+day; max 50 push/day per user | |

Behaviour: `429 Too Many Requests` as Problem Details with `Retry-After`; counters keyed on the
real client IP (`CF-Connecting-IP` trusted only from Cloudflare ranges); limits bypassed for
internal OIDC callers (scheduler, Pub/Sub). Abuse signals (repeated 429s, report spikes) feed
the moderation queue.

## 7. Admin MFA requirement

- Roles `MODERATOR`, `ADMIN`, `SUPER_ADMIN` must enrol a second factor (TOTP preferred, SMS
  fallback) in Identity Platform. Enrolment is enforced at first privileged login in the web
  app; the API rejects privileged routes when the ID token lacks a non-blank
  `firebase.sign_in_second_factor` claim -> `403 MFA_REQUIRED` (`AdminAuthorizationManager`,
  `orenji.security.admin.require-mfa`). **Actual values per profile (2026-10-05):** `true` in the
  base document and therefore in `dev`, `staging` and `prod` (no override), `false` only under
  `local` and `test` (`AdminMfaIT` re-enables it); a JVM started without a profile runs as `local`.
  The code does **not** yet check how recent the second factor is (`auth_time` is parsed but
  not compared); a freshness window is a hardening follow-up. Details and the per-account
  checklist: `owner-account-security-checklist.md`.
- `/admin` routes on `www` are additionally protected by Cloudflare rules (optional geo
  challenge) and admin actions are written to `audit_log` with actor, target, before/after and
  `requestId`.
- Break-glass: SUPER_ADMIN recovery codes stored offline by the owner; use is audited and
  followed by MFA re-enrolment.

## 8. Dependency and code scanning cadence

| Control | Cadence | Where |
| --- | --- | --- |
| Dependabot (gradle, npm, pip, actions, terraform, docker) grouped minor/patch | weekly (Monday 06:00 Toronto) | `.github/dependabot.yml` |
| Trivy fs scan (vuln, secret, misconfig) + SARIF to code scanning; gate on CRITICAL/HIGH fixed | every PR and push to `main` | `ci.yml` job `security` |
| `npm audit --audit-level=high` (web, mobile), `pip-audit` (ml) | every PR | `ci.yml` |
| CodeQL (java-kotlin, javascript-typescript, python) | every PR to `main` + weekly | `codeql.yml` |
| Base image refresh (Temurin, nginx, python) | weekly via Dependabot docker updates; rebuild on `main` | `docker-build.yml` |
| Cloudflare IP range refresh | quarterly | `infrastructure/cloudflare/README.md` section 8 |
| Manual security review (headers, CORS, rate limits, upload validation, authz tests) | before first production launch and each major phase | Phase 13 in `IMPLEMENTATION_STATUS.md` |
| Penetration test | before public launch, then yearly | external |

Findings SLA: Critical 48 h, High 7 days, Medium 30 days, Low next release.

## 9. Logging and PII rules

- Structured JSON logs to Cloud Logging with `requestId`, `module`, `userId` as HMAC hash,
  `route`, `status`, `durationMs`. Never log: request/response bodies of user content, message
  text, tokens or `Authorization` headers, precise coordinates, full email addresses (mask to
  `c***@example.com` when unavoidable), Stripe secrets, signed URLs.
- Problem Details responses never include stack traces, SQL or infrastructure details; the full
  error is logged at ERROR with the same `requestId`.
- Business markers logged as `jsonPayload.event`: `payment.webhook.failed`,
  `notification.delivery.failed`, `security.untrusted_proxy_header`, `security.mfa_required`,
  `geo.privacy_violation` (contract violation caught at runtime) — the first two drive
  Cloud Monitoring alerts (Terraform `monitoring` module).
- Retention: application logs 30 days; `audit_log` table and a Cloud Logging sink of admin
  actions 400 days; access to logs limited to operators (`roles/logging.privateLogViewer` only
  for the on-call group).
- Analytics events: schema-versioned, no PII, `actor_hash`, `region_label`, `geo_cell` only;
  a test asserts no field named like `lat`, `lng`, `email`, `home_point` reaches
  `AnalyticsEvent`.
- Data subject requests (Quebec Law 25 / PIPEDA): export and deletion are admin actions with
  audit entries; deletion completes within 30 days and cascades to media, messages (anonymised
  for the counterpart), analytics (hash unlinkable). Collectors can also export and delete
  themselves (Settings → Account), as the Privacy Policy explains in English and in French.
- Consent evidence: `user_consent` keeps, per collector, the document type, the version, the
  language the text was shown in (`en` / `fr`, V104), the timestamp, a salted hash of the IP and
  the user agent, plus an audit row; the 18+ attestation is one of these consents. Rows survive
  account deletion (the account is anonymised instead).

## 10. Incident contact

| Role | Contact | Notes |
| --- | --- | --- |
| Security owner | `security@orenjitrade.com` (placeholder, to be created) | Receives vulnerability reports; publish in `/.well-known/security.txt` on `www` with `Expires` and PGP key |
| On-call engineer | Cloud Monitoring email channel (`alert_email` Terraform variable) | Phase 14: PagerDuty/Opsgenie integration |
| Cloudflare / Google Cloud support | Dashboard support tickets | Enterprise support not yet purchased |
| Privacy officer (Law 25) | `privacy@orenjitrade.com` (placeholder) | Named in the Privacy Policy as "Privacy Officer / Responsable de la protection des renseignements personnels" (name, title and postal address are `[to confirm]` placeholders in both languages); handles data subject requests within 30 days and complaints, and the confidentiality-incident notifications to the Commission d'accès à l'information |

Report handling: acknowledge within 2 business days, triage within 5, fix per the SLA above,
credit the reporter if they wish. Follow `docs/deployment/runbooks.md` section 8 for the
incident process and section 11 below for the Law 25 duties.

## 11. Operating documents (Quebec Law 25, incidents, authorities, owner accounts)

Added for the launch (2026-10-05); drafts by engineering pending the lawyer's review, like the
legal texts they implement. They never claim compliance.

| Document | Purpose |
| --- | --- |
| [`confidentiality-incident-register.md`](confidentiality-incident-register.md) | Register template (date, description, data and people affected, risk-of-serious-injury assessment, notifications, measures) and the response procedure: contain, assess, notify the Commission d'accès à l'information and the people concerned when there is a risk of serious injury, record every incident even when not notified |
| [`law-enforcement-requests.md`](law-enforcement-requests.md) | Requests from police, courts and other authorities: release data only on valid legal process (except a documented emergency involving a risk to life), verify, disclose the minimum, keep precise locations out unless specifically compelled, log every request |
| [`owner-account-security-checklist.md`](owner-account-security-checklist.md) | Two-factor sign-in on the Google / Firebase, GitHub, Cloudflare (and registrar), Stripe and mailbox accounts; the actual `orenji.security.admin.require-mfa` value per Spring profile; the Terraform profile-name finding |
| `docs/deployment/runbooks.md` section 9 | Launch configuration: every money feature flag off, why, how to change it in `/admin`, and the V105 handling of the V010 defaults |

## Code scanning availability

CodeQL (`.github/workflows/codeql.yml`) and the Trivy filesystem scan (`ci.yml`, job
`security`) always run. Uploading their SARIF results to GitHub Code Scanning requires GitHub
Advanced Security, which private personal repositories do not have, so the upload steps are
gated on the repository variable `CODE_SCANNING_ENABLED=true`. Until it is set, results are
attached to each run as workflow artifacts (`codeql-<language>-sarif`, `trivy-fs-sarif`) and the
Trivy gate step (fail on CRITICAL/HIGH) remains the enforced check.

## npm audit exceptions

CI runs `node scripts/audit-gate.mjs` (also `npm run audit:gate`) instead of a bare
`npm audit --audit-level=high`. It fails on every high or critical advisory except those listed in
`security/npm-audit-allowlist.json`. An entry is allowed only when **no patched release exists**,
must state the exposure and why it is acceptable, and carries an expiry date after which the gate
fails again until someone re-reviews it. Moderate/low advisories are printed but never block.

| Advisory | Package | Expires | Why accepted |
| --- | --- | --- | --- |
| GHSA-86w9-cpqp-85rv | node-forge ≤ 1.4.0 (no fix published) | 2026-11-30 | Only via Expo build tooling (`@expo/cli` → `@expo/code-signing-certificates`) for expo-updates code signing, which is not used; not in the API or the web bundle. npm's "fix" would downgrade Expo to SDK 44. |
| GHSA-vfj7-8cjw-p6xm | braces ≤ 3.0.3 (no fix published) | 2026-11-30 | Only via build/test tooling glob matching (micromatch in Metro, Jest, Angular/Expo toolchains) with developer-written patterns; not in the web bundle or the API. |
