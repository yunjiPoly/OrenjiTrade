# ADR 0003 — Cloud Run before GKE

**Status:** Accepted · **Date:** 2026-09-29 · Refined by [ADR 0016](0016-low-cost-first-year-production-profile.md)
(2026-10-05: one api instance with a Redis sidecar in year one; `ml` not deployed while on hold)

## Context
Traffic is unknown and bursty; the team is small; every runtime is containerised.

## Decision
Deploy `api`, `web` (nginx serving the Angular build), and `ml` as Cloud Run services.
Periodic work (auto-delist, freshness warnings) is triggered by Cloud Scheduler hitting
authenticated internal endpoints; asynchronous work arrives through Pub/Sub push subscriptions.
Minimum instances ≥1 for `api` in production to keep WebSocket sessions and latency stable.

## Consequences
- No cluster to manage; scale-to-zero in dev/staging.
- WebSocket fan-out across instances goes through Redis pub/sub.
- Every image is plain OCI, so moving to GKE later is a deployment change, not a code change.
