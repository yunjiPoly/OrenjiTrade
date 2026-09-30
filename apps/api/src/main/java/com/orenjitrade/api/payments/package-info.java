/**
 * Payments module (Phase 9, feature flag {@code protectedPayments}, ADR 0011).
 *
 * <p>Payment protection of trades through the {@code PaymentProvider} abstraction ({@code
 * FakePaymentProvider} by default, {@code StripeConnectProvider} with {@code
 * PAYMENT_PROVIDER=stripe}): seller payout accounts and their onboarding, the protected checkout of
 * AWAITING_PAYMENT trades, provider webhooks (signature verified, stored, idempotent by provider
 * event id, applied after commit through {@code PaymentWebhookReceived}), shipping confirmation and
 * the dispute window, receipt confirmation and payout release, the hourly auto-release job,
 * disputes with typed evidence (TEXT, IMAGE, DOCUMENT, TRACKING; VIDEO reserved), messages and
 * admin notes, admin resolutions with refunds, the admin transaction / payment / webhook views and
 * the {@code payments.*} rows of {@code platform_settings}. Never card data, never "escrow".
 *
 * <p>Depends on the trades module (it moves protected trades through {@code TradeService} and
 * implements its {@code TradeProtection} extension point) and publishes {@code PaymentUpdated} and
 * {@code DisputeUpdated}.
 *
 * <p>Layout: {@code api/} (controllers + request/response DTOs), {@code domain/} (entities, value
 * objects, domain services), {@code infra/} (repositories, external adapters), {@code events/}
 * (published domain events). Entities never leave the module; other modules use its service
 * interface or its events, never its repositories.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Payments")
@org.jspecify.annotations.NullMarked
package com.orenjitrade.api.payments;
