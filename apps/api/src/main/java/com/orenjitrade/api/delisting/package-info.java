/**
 * Delisting module.
 *
 * <p>Auto-delisting of stale inventory: the configurable freshness policy ({@code delist_policy},
 * ADR 0014), the pure freshness rules ({@link
 * com.orenjitrade.api.delisting.domain.FreshnessPolicy}, {@link
 * com.orenjitrade.api.delisting.domain.FreshnessLabels}), the freshness audit trail ({@code
 * inventory_freshness_event}), the admin policy endpoints and the {@code delist} job. The binders
 * and inventory modules apply the policy; this module never touches their tables.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Delisting")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.delisting;
