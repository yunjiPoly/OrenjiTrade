/**
 * Donations module.
 *
 * <p>Voluntary donations through the payment provider abstraction.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Donations")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.donations;
