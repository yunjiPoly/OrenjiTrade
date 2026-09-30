/**
 * Payments module.
 *
 * <p>PaymentProvider abstraction with Stripe Connect adapter and FakePaymentProvider; protected
 * transactions, disputes and webhooks (feature flagged, ADR 0011).
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Payments")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.payments;
