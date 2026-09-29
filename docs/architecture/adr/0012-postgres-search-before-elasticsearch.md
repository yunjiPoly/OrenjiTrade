# ADR 0012 — PostgreSQL full-text + trigram search before any search engine

**Status:** Accepted · **Date:** 2026-09-29

## Context
Search targets are cards, printings, sets, collectors and public binders — at most a few
million rows for years. Search must combine text relevance with geographic and availability
filters that live in the same database.

## Decision
`tsvector` generated columns (`search_vector`) with `unaccent` + `pg_trgm` GIN indexes on
card/printing/set/profile/binder names. One `SearchService` composes text rank with PostGIS
radius filters and freshness ranking in SQL. No Elasticsearch/OpenSearch until measured
latency or relevance needs justify it (a future ADR).

## Consequences
- One source of truth, transactional consistency, no sync jobs.
- Typos handled by trigram similarity; multilingual names (EN/FR/JA) by `simple` config +
  unaccent rather than language stemming.
