/**
 * Wishlist module.
 *
 * <p>Wishlists and wishlist items; matching of newly published inventory against the wishlists of
 * collectors in the same platform region (ADR 0017).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Wishlist")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.wishlist;
