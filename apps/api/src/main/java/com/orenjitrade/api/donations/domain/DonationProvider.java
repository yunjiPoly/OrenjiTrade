package com.orenjitrade.api.donations.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Donation payment abstraction (Phase 10 contract "Donations"). Exactly one implementation is
 * active, selected by {@code orenji.donations.provider} ({@code DONATION_PROVIDER}); only {@code
 * FakeDonationProvider} ({@code fake}, the default: no credentials, no money) exists so far — a
 * Stripe Checkout adapter ({@code mode=payment}) will plug in here. Implementations exchange
 * provider references only, never card data.
 */
public interface DonationProvider {

    /** {@code fake} (also the path segment of the webhook route). */
    String providerId();

    /** Opens a hosted checkout for a donation. */
    Checkout startCheckout(CheckoutRequest request);

    /** Refunds a succeeded donation (idempotent per key). */
    Refund refund(String checkoutRef, BigDecimal amount, String currency, String idempotencyKey);

    /**
     * Verifies a webhook's signature and reads it.
     *
     * @throws com.orenjitrade.api.common.webhooks.SignedWebhooks.InvalidSignatureException for a
     *     missing, wrong or old signature
     * @throws com.orenjitrade.api.common.webhooks.SignedWebhooks.UnreadablePayloadException for a
     *     correctly signed but unreadable body
     */
    DonationEvent parseWebhook(String payload, Map<String, String> headers);

    /**
     * What {@link #startCheckout} needs.
     *
     * @param donationId our donation id
     * @param userId the donor
     * @param amount amount
     * @param currency ISO 4217 code
     * @param successPath web path after payment
     * @param cancelPath web path when the donor gives up
     */
    record CheckoutRequest(
            UUID donationId,
            UUID userId,
            BigDecimal amount,
            String currency,
            String successPath,
            String cancelPath) {}

    /**
     * An opened checkout.
     *
     * @param checkoutRef provider reference
     * @param url where the donor pays (a web path for the fake provider)
     */
    record Checkout(String checkoutRef, String url) {}

    /**
     * A refund.
     *
     * @param refundRef provider reference
     * @param succeeded whether it already succeeded
     */
    record Refund(String refundRef, boolean succeeded) {}

    /** What a donation webhook means. */
    enum EventKind {
        SUCCEEDED,
        FAILED,
        REFUNDED,
        OTHER
    }

    /**
     * A verified donation webhook, normalised.
     *
     * @param providerEventId the provider's event id (idempotency key)
     * @param type the provider's event type
     * @param kind what it means
     * @param checkoutRef checkout reference
     * @param failureCode provider failure code
     * @param occurredAt when the provider created it
     */
    record DonationEvent(
            String providerEventId,
            String type,
            EventKind kind,
            @Nullable String checkoutRef,
            @Nullable String failureCode,
            Instant occurredAt) {}

    /** The provider refused a call or could not be reached. */
    final class DonationProviderException extends RuntimeException {

        public DonationProviderException(String message, @Nullable Throwable cause) {
            super(message, cause);
        }
    }
}
