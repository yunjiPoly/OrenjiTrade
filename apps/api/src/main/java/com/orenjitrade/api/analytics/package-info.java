/**
 * Analytics module.
 *
 * <p>Schema-versioned analytics events (no PII, grid-cell geography only) published through the
 * EventTransport to Pub/Sub and BigQuery; consumes domain events only.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Analytics")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.analytics;
