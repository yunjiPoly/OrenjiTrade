/**
 * Delisting module.
 *
 * <p>Auto-delisting of stale inventory: the configurable freshness policy ({@code delist_policy},
 * ADR 0014), the pure freshness rules ({@link
 * com.orenjitrade.api.delisting.domain.FreshnessPolicy}, {@link
 * com.orenjitrade.api.delisting.domain.FreshnessLabels}), the freshness audit trail ({@code
 * inventory_freshness_event}), the admin policy endpoints and the {@code delist} job. The binders
 * and inventory modules apply the policy; this module never writes their tables. Phase 7: pauses of
 * a collector's public listings and unresponsiveness strikes ({@code user_responsiveness}, {@code
 * ListingPauseService}, {@code ListingPauseRules} used by the visibility rules of the binders
 * module), the strike evaluation of the nightly {@code delist} job over the {@code
 * ResponsivenessSource} extension point (implemented by the messaging module) and the owner/admin
 * pause endpoints; it reads the materialised {@code publicly_listed} flags of binders and items
 * read-only. Publishes {@code ListingsPaused} and {@code ListingsResumed}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Delisting")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.delisting;
