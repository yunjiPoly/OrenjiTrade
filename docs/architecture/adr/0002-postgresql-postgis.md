# ADR 0002 — PostgreSQL + PostGIS as the single operational database

**Status:** Accepted · **Date:** 2026-09-29 · **Amended:** 2026-10-08 by
[ADR 0017](0017-platform-regions-instead-of-geolocation.md)

> Amendment 2026-10-08 (ADR 0017): OrenjiTrade no longer stores coordinates. The geography
> columns, GiST indexes and radius queries below are gone (V108); collectors declare a country
> and a state/province and are found per platform region. PostgreSQL stays the single
> operational database; the PostGIS image and extension stay installed but unused by location,
> and removing them is a separate decision.

## Context
Core queries are relational (users, binders, inventory, offers) plus geographic
("collectors within 10 km with printing X") plus text search. Cloud SQL supports PostGIS.

## Decision
PostgreSQL 17 with PostGIS 3.5 on Cloud SQL. Geography columns (`geography(Point,4326)`) with
GiST indexes for radius queries (`ST_DWithin`). `pg_trgm` + `tsvector` for search (ADR 0012).
JSONB for game-specific card metadata (ADR 0005). Flyway owns the schema; migrations are
forward-only SQL files. Local: `postgis/postgis:17-3.5` via Docker Compose; tests use the same
image through Testcontainers so PostGIS behaviour is tested for real.

## Consequences
- One database to back up, monitor, and reason about.
- Analytics is *not* run here; events stream to BigQuery (spec §39).
- Redis is a cache/coordination layer only, never a source of truth.
