# ADR 0009 — Domain events via transactional outbox with a Pub/Sub adapter

**Status:** Accepted · **Date:** 2026-09-29

## Context
Notifications, wishlist matching, analytics, auto-delisting, ML scanning and email must not
block HTTP requests (spec §46) and must survive crashes. Local development must not require
cloud credentials.

## Decision
Modules publish typed domain events (`InventoryItemPublished`, `MessageSent`, ...) with
Spring's `ApplicationEventPublisher` inside the transaction. Spring Modulith's JDBC event
publication registry persists them (outbox) and delivers to `@ApplicationModuleListener`
handlers asynchronously after commit, retrying incomplete publications on restart.
An `EventExternalizer` forwards selected events to an `EventTransport`:
`LocalEventTransport` (no-op/log, default) or `PubSubEventTransport` (Google Pub/Sub topics
`domain-events`, `analytics-events`). Cloud Run receives Pub/Sub push deliveries on
`/internal/events/pubsub` (OIDC-authenticated) so cross-instance consumers and BigQuery
subscriptions work. Scheduled jobs are HTTP endpoints under `/internal/jobs/*` invoked by
Cloud Scheduler (or `@Scheduled` under the `local` profile).

## Consequences
- Exactly the same handler code runs locally and in the cloud.
- At-least-once delivery: handlers must be idempotent (dedup keys on notifications).
- Rejected: Kafka (operational weight), direct synchronous calls to the ML service.
