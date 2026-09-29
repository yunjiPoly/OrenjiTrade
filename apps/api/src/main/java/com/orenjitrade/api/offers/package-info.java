/**
 * Offers module.
 *
 * Cash, trade and mixed offers with lifecycle OPEN -> COUNTERED -> ACCEPTED ->
 * DECLINED/CANCELLED/EXPIRED and full history.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Offers")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.offers;
