package com.orenjitrade.api.billing.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Subscription billing abstraction (Phase 10 contract "Plans and limits", ADR 0011 pattern).
 * Exactly one implementation is active, selected by {@code orenji.billing.provider} ({@code
 * BILLING_PROVIDER}): {@code FakeBillingProvider} ({@code fake}, the default: local development and
 * tests, no credentials, no money) or {@code StripeBillingProvider} ({@code stripe}: Stripe
 * Checkout in subscription mode and Stripe Billing webhooks; never required locally).
 *
 * <p>Implementations exchange provider references only, never card data. Platform billing of the
 * mobile stores (App Store / Google Play receipts) is reserved: {@code POST
 * /me/subscription/mobile-receipt} answers 501 until it is built.
 */
public interface BillingProvider {

    /** {@code fake} or {@code stripe} (also the path segment of the webhook route). */
    String providerId();

    /** Opens a hosted checkout for a new subscription; the member pays there. */
    Checkout startCheckout(CheckoutRequest request);

    /**
     * Cancels a subscription at the provider, at the end of the paid period or immediately. A no-op
     * for unknown or already closed subscriptions.
     */
    void cancel(String subscriptionRef, boolean atPeriodEnd);

    /**
     * Verifies a webhook's signature and reads it.
     *
     * @throws com.orenjitrade.api.common.webhooks.SignedWebhooks.InvalidSignatureException when the
     *     signature is missing, wrong or too old
     * @throws com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException when a
     *     correctly signed body cannot be read
     */
    BillingEvent parseWebhook(String payload, Map<String, String> headers);

    /**
     * What {@link #startCheckout} needs.
     *
     * @param subscriptionId our subscription id (metadata and idempotency)
     * @param userId the member
     * @param planCode plan bought
     * @param planName display name of the plan
     * @param amount price per period
     * @param currency ISO 4217 code
     * @param successPath web path the provider returns to after payment
     * @param cancelPath web path the provider returns to when the member gives up
     */
    record CheckoutRequest(
            UUID subscriptionId,
            UUID userId,
            String planCode,
            String planName,
            BigDecimal amount,
            String currency,
            String successPath,
            String cancelPath) {}

    /**
     * An opened checkout.
     *
     * @param checkoutRef provider checkout reference
     * @param url where the member pays (a web path for the fake provider)
     * @param clientSecret client secret of an embedded form, never stored
     */
    record Checkout(String checkoutRef, String url, @Nullable String clientSecret) {}

    /** What a billing webhook means for the platform. */
    enum EventKind {
        CHECKOUT_COMPLETED,
        CHECKOUT_FAILED,
        SUBSCRIPTION_RENEWED,
        PAYMENT_FAILED,
        SUBSCRIPTION_CANCELLED,
        OTHER
    }

    /**
     * A verified billing webhook, normalised.
     *
     * @param providerEventId the provider's event id (idempotency key)
     * @param type the provider's event type as sent
     * @param kind what it means
     * @param checkoutRef checkout reference (checkout events)
     * @param subscriptionRef provider subscription reference
     * @param periodStart start of the paid period, when the provider reports it
     * @param periodEnd end of the paid period, when the provider reports it
     * @param failureCode provider failure code (failed payments and checkouts)
     * @param occurredAt when the provider created the event
     */
    record BillingEvent(
            String providerEventId,
            String type,
            EventKind kind,
            @Nullable String checkoutRef,
            @Nullable String subscriptionRef,
            @Nullable Instant periodStart,
            @Nullable Instant periodEnd,
            @Nullable String failureCode,
            Instant occurredAt) {}

    /** The provider refused a call or could not be reached (the change is rolled back). */
    final class BillingProviderException extends RuntimeException {

        public BillingProviderException(String message, @Nullable Throwable cause) {
            super(message, cause);
        }
    }
}
