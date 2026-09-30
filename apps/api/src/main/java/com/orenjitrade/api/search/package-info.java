/**
 * Search module.
 *
 * <p>Unified search over cards, printings, sets, collectors and public binders using PostgreSQL
 * full-text search and pg_trgm (ADR 0012); geographic collector search on public_point. Phase 4:
 * {@code GET /collectors/nearby} and {@code GET /collectors/{handle}/preview} (map discovery,
 * Redis-cached 60 s, invalidated by inventory, location, privacy and account events), {@code GET
 * /search}, {@code GET /search/card-holders} and {@code GET /search/suggest}. Reads other modules'
 * tables read-only through SQL (public point only, never a trading-area centre) and their services
 * for catalog resolution, public binders and public items; publishes {@code SearchPerformed} and
 * {@code CollectorPreviewed} for the analytics module.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Search")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.search;
