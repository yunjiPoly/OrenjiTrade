# Architecture Decision Records

Format: context → decision → consequences. Status is `Accepted` unless noted. Never change a
major decision silently: add a superseding ADR and link both ways.

| # | Title |
| --- | --- |
| [0001](0001-modular-monolith.md) | Modular monolith before microservices |
| [0002](0002-postgresql-postgis.md) | PostgreSQL + PostGIS as the single operational database |
| [0003](0003-cloud-run-before-gke.md) | Cloud Run before GKE |
| [0004](0004-collector-location-privacy.md) | Collector location privacy model |
| [0005](0005-multi-tcg-data-model.md) | Generic multi-TCG card model with JSONB metadata |
| [0006](0006-angular-web-react-native-mobile.md) | Angular for web, React Native + Expo for mobile |
| [0007](0007-spring-boot-backend.md) | Java 21 + Spring Boot 4.1 backend |
| [0008](0008-firebase-identity-platform.md) | Firebase Authentication / Identity Platform as identity provider |
| [0009](0009-domain-events-outbox-pubsub.md) | Domain events via transactional outbox with a Pub/Sub adapter |
| [0010](0010-map-provider-abstraction.md) | Google Maps behind a map adapter with Leaflet fallback |
| [0011](0011-payments-stripe-connect-abstraction.md) | Payments through a provider abstraction (Stripe Connect), feature-flagged |
| [0012](0012-postgres-search-before-elasticsearch.md) | PostgreSQL full-text + trigram search before any search engine |
| [0013](0013-google-client-libraries-not-spring-cloud-gcp.md) | Google Cloud client libraries instead of Spring Cloud GCP |
| [0014](0014-configurable-business-rules.md) | Business rules (limits, delisting, flags) are data, not code |
| [0015](0015-card-images-provider-hosting-capped-cache.md) | Card images: provider hosting policies and a capped image cache (≤ 5 GB since 2026-10-04, previously 500 MB; renditions on object storage in the cloud since 2026-10-05) |
| [0016](0016-low-cost-first-year-production-profile.md) | Low-cost first-year production profile (db-g1-small, Valkey sidecar, one api instance, Direct VPC egress, Certificate Manager behind Cloudflare, cost table and scale-up path) |
