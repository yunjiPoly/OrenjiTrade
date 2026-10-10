/**
 * Wishlist module.
 *
 * <p>Wishlist items (which copy, public note, Near Mint only, price term; stage S2) and the
 * wishlist alerts sent when a collector of the same platform region lists a fitting public item
 * (ADR 0017). No matches are stored: only a sent-alert key per collector and item.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Wishlist")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.wishlist;
