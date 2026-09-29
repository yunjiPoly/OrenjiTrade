/**
 * Delisting module.
 *
 * Auto-delisting of stale inventory: configurable freshness policies, scheduled evaluation,
 * warnings and restore.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Delisting")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.delisting;
