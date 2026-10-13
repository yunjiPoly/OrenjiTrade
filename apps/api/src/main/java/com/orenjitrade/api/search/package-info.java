/**
 * Search module.
 *
 * <p>Unified search over cards, printings, sets, collectors and public binders using PostgreSQL
 * full-text search and pg_trgm (ADR 0012), scoped to one platform region (ADR 0017): {@code GET
 * /search}, {@code GET /search/card-holders} and {@code GET /search/suggest}, plus the map's {@code
 * GET /regions/{region}/binder-counts} and {@code GET
 * /regions/{region}/subdivisions/{code}/binders} (Redis-cached 60 s, invalidated by inventory,
 * location, region, privacy and account events). Reads other modules' tables read-only through SQL
 * (country and subdivision only, never a city) and their services for catalog resolution, public
 * binders and public items; publishes {@code SearchPerformed} for the analytics module.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Search")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.search;
