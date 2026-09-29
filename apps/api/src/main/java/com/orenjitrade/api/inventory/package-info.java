/**
 * Inventory module.
 *
 * <p>Collector inventory items: quantity, condition, pricing, availability, visibility, photos and
 * freshness; bulk operations; public item lists; the effective-visibility reconciliation that emits
 * {@code InventoryItemPublished} / {@code InventoryItemUnpublished} once per transition; the hourly
 * freshness job. Depends on the binders module (items live in binders) and implements its {@link
 * com.orenjitrade.api.binders.domain.BinderContents} extension point.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Inventory")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.inventory;
