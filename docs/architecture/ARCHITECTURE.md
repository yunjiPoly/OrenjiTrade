# OrenjiTrade — System Architecture

OrenjiTrade is a geographic discovery network for trading cards: collectors publish binders and
find each other on a map at approximate positions. This document is the map of the system;
decisions are recorded in [ADRs](adr/README.md).

## 1. System context

```mermaid
flowchart LR
  subgraph Clients
    Web[Angular web<br/>www.orenjitrade.com]
    Mobile[Expo / React Native<br/>iOS · Android]
  end
  CF[Cloudflare<br/>DNS · CDN · WAF]
  subgraph GCP[Google Cloud]
    LB[External HTTPS LB<br/>serverless NEGs]
    WebRun[Cloud Run: web<br/>nginx static]
    ApiRun[Cloud Run: api<br/>Spring Boot]
    MlRun[Cloud Run: ml<br/>FastAPI]
    SQL[(Cloud SQL<br/>PostgreSQL + PostGIS)]
    Redis[(Memorystore Redis)]
    GCS[(Cloud Storage<br/>media)]
    PubSub[[Pub/Sub]]
    BQ[(BigQuery)]
    Sched[Cloud Scheduler]
    SM[Secret Manager]
  end
  FB[Firebase Auth /<br/>Identity Platform]
  FCM[Firebase Cloud Messaging]
  Stripe[Stripe Connect]
  GMaps[Google Maps Platform]

  Web --> CF --> LB
  Mobile --> CF
  LB --> WebRun
  LB --> ApiRun
  ApiRun --> SQL
  ApiRun --> Redis
  ApiRun --> GCS
  ApiRun --> PubSub
  PubSub --> ApiRun
  PubSub --> MlRun
  PubSub --> BQ
  Sched --> ApiRun
  ApiRun --> SM
  Web -. sign-in .-> FB
  Mobile -. sign-in .-> FB
  ApiRun -. verify token .-> FB
  ApiRun --> FCM
  ApiRun --> Stripe
  Web -. tiles .-> GMaps
  Mobile -. tiles .-> GMaps
```

Domains: `www.orenjitrade.com` (web + `/admin`), `api.orenjitrade.com` (REST + WebSocket).
The ML service is internal only (Pub/Sub + authenticated service-to-service calls).

## 2. Repository and application boundaries

| Path | Runtime | Responsibility |
| --- | --- | --- |
| `apps/api` | Spring Boot 4.1 / Java 21 | All business logic, persistence, authorization, events |
| `apps/web-angular` | Angular 22 | Desktop/responsive web UI incl. admin console |
| `apps/mobile` | Expo SDK 58 | Native mobile UI (bottom tabs, camera, push) |
| `apps/ml` | FastAPI / Python | Card identification, duplicate detection, future ranking |
| `packages/api-client` | generated | Angular HttpClient services from OpenAPI |
| `packages/shared-types` | generated | TypeScript types from OpenAPI for mobile (+ `openapi-fetch`) |
| `packages/design-tokens` | CSS/TS | Colours, typography, spacing, radii, status colours |
| `infrastructure/terraform` | Terraform | GCP resources per environment |
| `infrastructure/docker` | Docker | Local emulators, Dockerfiles helpers |
| `infrastructure/cloudflare` | docs/IaC | DNS records, cache and WAF rules |

Dependency direction: clients → API contract (OpenAPI) → API. API → database/redis/cloud
adapters. API never depends on clients or on the ML service being available.

## 3. Backend modular monolith

```mermaid
flowchart TB
  subgraph api[apps/api  com.orenjitrade.api]
    common[common: errors · request-id · pagination · time · money]
    auth --> users --> profiles
    profiles --> location
    games --> cards
    cards --> inventory --> binders
    inventory --> search
    location --> search
    inventory --> wishlist
    messaging
    community
    notifications
    ratings
    reports
    offers --> trades --> payments
    billing --> credits
    donations
    ads
    moderation
    admin
    audit
    analytics
    featureflags
    delisting
  end
```

Rules (see `CLAUDE.md`): one package per module with `api/ domain/ infra/ events/`; entities
never leave the module; cross-module reads go through the other module's service; writes that
must be decoupled go through domain events. `admin` and `audit` are cross-cutting consumers of
every module's service layer. `analytics` only consumes events.

### Request pipeline

`RequestIdFilter` → `SecurityFilterChain` (`BearerTokenAuthenticationFilter` → `IdentityTokenVerifier`
→ `UserAccountProvisioner`) → `RateLimitFilter` (Redis) → controller (DTO validation) →
service (`@PreAuthorize` + ownership checks + `@Transactional`) → repository →
`ProblemDetailsExceptionHandler` on failure (RFC 9457 with `errorCode`, `requestId`, `timestamp`).

## 4. Authentication flow

```mermaid
sequenceDiagram
  participant C as Client (web/mobile)
  participant F as Firebase Auth
  participant A as API
  participant DB as PostgreSQL
  C->>F: signInWithEmailAndPassword / Google / Apple
  F-->>C: ID token (JWT, 1h) + refresh token
  C->>A: GET /api/v1/me  Authorization: Bearer <idToken>
  A->>A: IdentityTokenVerifier.verify (Firebase Admin SDK, cached certs)
  A->>DB: upsert user_account by provider_uid (first login provisions USER role)
  A->>A: build AuthenticatedUser {id, roles, suspended?, termsAccepted?}
  A-->>C: 200 profile  | 403 SUSPENDED | 428 TERMS_REQUIRED
```

Roles (`USER`, `PREMIUM_USER`, `MODERATOR`, `ADMIN`, `SUPER_ADMIN`) live in `user_role`. Admin
routes additionally require a recent second factor. Local dev uses the Firebase emulator;
tests use a static verifier (ADR 0008).

## 5. Geographic privacy model

See [ADR 0004](adr/0004-collector-location-privacy.md). Summary:

```mermaid
flowchart LR
  A[User picks trading area<br/>or shares device location] --> B[location module<br/>trading_area_center · radius]
  B --> C[ApproximateLocationService<br/>1 km grid snap + deterministic jitter]
  C --> D[(user_location.public_point<br/>GiST index)]
  D --> E[/api/v1/collectors/nearby<br/>ST_DWithin on public_point/]
  E --> F[Clients render approximate markers<br/>bucketed distance]
```

Only `public_point` is ever read by public queries. Precise fields never reach DTOs, logs or
analytics. A contract test rejects coordinates with more than 3 decimals in any response.

### Card catalog and images

Card metadata comes from `CardProvider` adapters (`MockCardProvider` locally, `YgoProDeckCardProvider`
for the real Yu-Gi-Oh! catalog) and is always imported completely. Card images are separate: one
`card_image` row per provider artwork, a provider hosting policy (`REHOST_REQUIRED` /
`HOTLINK_ALLOWED`), a single `CardImageUrlResolver` for every DTO and a capped local cache (at most
5 GB = 5120 MiB since 2026-10-04, enough for the whole Yu-Gi-Oh! catalog at 320 px) served by
`GET /api/v1/public/card-images/{id}` — see
[ADR 0015](adr/0015-card-images-provider-hosting-capped-cache.md).

## 6. Inventory model

```mermaid
erDiagram
  USER_ACCOUNT ||--o{ BINDER : owns
  USER_ACCOUNT ||--o{ INVENTORY_ITEM : owns
  BINDER ||--o{ INVENTORY_ITEM : contains
  CARD_PRINTING ||--o{ INVENTORY_ITEM : "is a copy of"
  CARD ||--o{ CARD_PRINTING : has
  GAME ||--o{ CARD : has
  GAME ||--o{ CARD_SET : has
  CARD_SET ||--o{ CARD_PRINTING : includes
  INVENTORY_ITEM {
    uuid id
    int quantity
    text condition
    text language
    text edition
    numeric asking_price
    text currency
    text availability "COLLECTION_ONLY|TRADE|SALE|TRADE_OR_SALE|NOT_AVAILABLE"
    boolean accepts_offers
    text visibility "PRIVATE|PUBLIC|TEMPORARILY_PUBLIC"
    timestamptz public_until
    timestamptz confirmed_at
    text freshness_state "ACTIVE|AGING|STALE|HIDDEN"
  }
```

Effective visibility = item visibility ∩ binder visibility ∩ owner discoverability ∩ freshness
(`HIDDEN` items are excluded from public queries until reconfirmed). Freshness thresholds come
from `delist_policy` rows (ADR 0014). Nothing stale is deleted.

## 7. Events, notifications, background processing

```mermaid
flowchart LR
  S[Service @Transactional] -->|publishEvent| R[(event_publication<br/>Modulith registry)]
  R -->|after commit, async| H1[Wishlist matcher]
  R --> H2[Notification dispatcher]
  R --> H3[Analytics externalizer]
  R --> H4[ML scan requester]
  H1 -->|match| H2
  H2 --> InApp[(notification table)]
  H2 --> Push[PushProvider<br/>FCM / log]
  H2 --> Mail[EmailProvider]
  H3 --> T{EventTransport}
  T -->|local| Log[log]
  T -->|cloud| PS[[Pub/Sub]] --> BQ[(BigQuery)]
  H4 --> PS --> ML[ML service]
  ML -->|results| API[/internal/events/pubsub/]
```

Handlers are idempotent (notification dedup key = type + subject + recipient + day). Wishlist
matching is deterministic SQL: new public item × wishlist items (game/card/printing/condition/
price) × `ST_DWithin(public_point, wishlist owner public_point, radius)` × preferences.
Periodic jobs (`/internal/jobs/freshness`, `/internal/jobs/delist`) run via Cloud Scheduler in
the cloud and `@Scheduled` locally.

## 8. Analytics architecture

Application → `AnalyticsEvent` (schema-versioned JSON, no PII, grid-cell geography only) →
`EventTransport` → Pub/Sub `analytics-events` → BigQuery subscription → dataset
`orenjitrade_analytics` (partitioned by day, clustered by `event_type`). Transformations with
dbt later. Never query the transactional database for analytics.

## 9. ML architecture

`apps/ml` (FastAPI). Endpoints: `GET /health`, `POST /v1/identify` (image → ranked candidates
with confidence), `POST /v1/duplicates`. Consumes `card.scan.requested` events (Pub/Sub push)
and posts results back to the API. The API treats ML as optional: if unreachable, inventory
creation proceeds manually and scan requests are marked `ML_UNAVAILABLE`.

## 10. Deployment architecture

```mermaid
flowchart LR
  Dev[GitHub push / PR] --> CI[GitHub Actions<br/>lint · test · scan · build]
  CI -->|WIF/OIDC, no keys| AR[Artifact Registry]
  AR --> CRd[Cloud Run dev]
  CRd -->|promote| CRs[Cloud Run staging]
  CRs -->|approval| CRp[Cloud Run prod]
  TF[Terraform<br/>environments/dev·staging·prod] --> GCP[GCP resources]
  CFd[Cloudflare<br/>www · api records<br/>WAF · cache bypass for api] --> CRp
```

Environments: `local` (Docker Compose), `development`, `staging`, `production` (`ORENJI_ENV`;
the Spring profiles are `local`, `dev`, `staging`, `prod`) — separate GCP projects or at least
separate Cloud SQL instances, secrets and service accounts. Details in `docs/deployment/`.

First-year production profile (ADR 0016, 2026-10-05): one always-on `api` Cloud Run instance
with a Valkey sidecar as its Redis (no Memorystore until the scale-up path), Cloud SQL
`db-g1-small` ZONAL, Direct VPC egress (no connector, no Cloud NAT), the web service scaled to
zero, a Certificate Manager certificate behind Cloudflare, no `ml` service while Phase 11 is on
hold. The diagram above shows the full topology the modules can still produce.

## 11. Observability

Structured JSON logs with `requestId`, `userId` (hashed), `module`; Micrometer metrics to
Cloud Monitoring; `/actuator/health/liveness` and `/readiness`; alerts on HTTP 5xx rate,
p95 latency, DB connection saturation, Pub/Sub backlog age, notification/payment webhook
failures, ML failure rate, storage errors, auth failures.
