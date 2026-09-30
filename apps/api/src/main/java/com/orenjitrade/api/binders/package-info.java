/**
 * Binders module.
 *
 * <p>Binders group inventory items and carry their own visibility (PRIVATE, PUBLIC or
 * TEMPORARILY_PUBLIC); public binder views; the effective public visibility rules shared with the
 * inventory module ({@link com.orenjitrade.api.binders.domain.PublicVisibilityRules}). Item
 * operations the binders need (counts, confirming or releasing the items of a binder) go through
 * the {@link com.orenjitrade.api.binders.domain.BinderContents} extension point implemented by the
 * inventory module, so the dependency only points from inventory to binders.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Binders")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.binders;
