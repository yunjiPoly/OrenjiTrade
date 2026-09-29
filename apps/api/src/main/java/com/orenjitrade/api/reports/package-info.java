/**
 * Reports module.
 *
 * Collector reports filed by users (reason required) and their review lifecycle OPEN ->
 * UNDER_REVIEW -> ACTIONED/DISMISSED.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Reports")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.reports;
