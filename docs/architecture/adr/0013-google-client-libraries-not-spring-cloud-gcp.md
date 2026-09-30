# ADR 0013 — Google Cloud client libraries instead of Spring Cloud GCP

**Status:** Accepted · **Date:** 2026-09-29

## Context
Spring Cloud GCP lags Spring Boot releases (not compatible with Boot 4.1 at the time of this
decision). Our cloud integrations are already behind interfaces (ADR 0009, storage, push).

## Decision
Use the official Google Cloud Java client libraries (`libraries-bom`: `google-cloud-pubsub`,
`google-cloud-storage`, `google-cloud-secretmanager`) and `firebase-admin` directly inside
adapter classes (`PubSubEventTransport`, `GcsObjectStorage`, `FcmPushProvider`). Local
equivalents: `LocalEventTransport`, `LocalFileObjectStorage`, `LogPushProvider`.

## Consequences
- Upgrading Spring Boot is decoupled from Google's Spring integration cadence.
- Slightly more wiring code, confined to `infra/` packages.
