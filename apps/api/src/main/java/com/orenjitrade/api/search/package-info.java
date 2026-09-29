/**
 * Search module.
 *
 * <p>Unified search over cards, printings, sets, collectors and public binders using PostgreSQL
 * full-text search and pg_trgm (ADR 0012); geographic collector search on public_point.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Search")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.search;
