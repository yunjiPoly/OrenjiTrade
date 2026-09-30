/**
 * Feature flags module.
 *
 * <p>Feature flags and configurable business rules stored in the database, edited through /admin
 * and cached in Redis (ADR 0014).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Feature flags")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.featureflags;
