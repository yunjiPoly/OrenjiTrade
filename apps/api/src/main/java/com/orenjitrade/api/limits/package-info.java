/**
 * Usage limits module.
 *
 * <p>Configurable usage limits ({@code usage_limit}, ADR 0014), their counters ({@code
 * usage_counter}) and the {@code 429 LIMIT_REACHED} problem; other modules call {@link
 * com.orenjitrade.api.limits.domain.Limits} and may report the usage of a TOTAL limit through a
 * {@link com.orenjitrade.api.limits.domain.LimitUsageSource}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters). Entities never leave
 * the module; other modules use its service interface, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Limits")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.limits;
