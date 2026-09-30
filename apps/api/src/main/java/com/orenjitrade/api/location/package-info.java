/**
 * Location module.
 *
 * <p>The only module allowed to read precise coordinates. Derives user_location.public_point (1 km
 * grid snap + deterministic jitter) from the chosen trading area; every public query uses
 * public_point only (ADR 0004).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Location")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.location;
