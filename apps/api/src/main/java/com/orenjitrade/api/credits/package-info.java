/**
 * Credits module.
 *
 * Append-only credit ledger with derived balances.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Credits")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.credits;
