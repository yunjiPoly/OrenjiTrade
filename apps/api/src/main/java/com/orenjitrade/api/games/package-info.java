/**
 * Games module.
 *
 * <p>Supported trading card games and their game-specific metadata schemas (ADR 0005).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Games")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.games;
