# ADR 0001 — Modular monolith before microservices

**Status:** Accepted · **Date:** 2026-09-29

## Context
OrenjiTrade spans ~25 functional areas (auth, inventory, geo search, chat, offers, payments,
admin, ...). A small team must ship an MVP quickly with strong consistency guarantees
(inventory visibility, offers, ledgers) and low operational overhead.

## Decision
One Spring Boot application (`apps/api`) organised as a modular monolith: one Java package per
module under `com.orenjitrade.api`, each with `api/`, `domain/`, `infra/`, `events/`.
Modules communicate through service interfaces or domain events, never through each other's
repositories. Spring Modulith supplies the event publication registry. The Python ML service
is the only separate runtime because it uses a different ecosystem and must never be a hard
dependency (ADR 0009, spec §37).

## Consequences
- Single deployable, single database, ACID transactions across modules.
- Modules can be extracted later along package boundaries; Docker images already exist.
- Discipline required: module boundaries are enforced by convention and review now, by a
  Modulith verification test during hardening.
- Rejected: microservices (operational cost, distributed transactions), Kubernetes (ADR 0003).
