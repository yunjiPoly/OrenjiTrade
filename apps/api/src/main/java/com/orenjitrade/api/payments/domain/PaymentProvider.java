package com.orenjitrade.api.payments.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Payment provider abstraction (ADR 0011, Phase 9 contract "Provider abstraction"). Exactly one
 * implementation is active, selected by {@code orenji.payments.provider} ({@code
 * PAYMENT_PROVIDER}): {@code FakePaymentProvider} ({@code fake}, the default: local development and
 * tests, no credentials) or {@code StripeConnectProvider} ({@code stripe}: Connect Express
 * onboarding, the payment captured on the platform and a transfer to the seller's connected account
 * when the payout is released).
 *
 * <p>Implementations never see or return card data; they only exchange provider references. Calls
 * that move money take an idempotency key so a retried request never moves it twice.
 */
public interface PaymentProvider {

    /** {@code fake} or {@code stripe} (also the path segment of the webhook route). */
    String providerId();

    /**
     * Starts (or resumes) the onboarding of a seller's payout account.
     *
     * @param userId the seller
     * @param accountRef the provider account created by an earlier attempt, if any
     * @param returnUrl where the provider sends the seller back (a web path)
     */
    SellerOnboarding onboardSeller(UUID userId, @Nullable String accountRef, String returnUrl);

    /** Current state of a seller's payout account at the provider. */
    SellerAccountStatus sellerStatus(String accountRef);

    /** Creates the protected payment of a trade; the buyer completes it at the checkout. */
    ProtectedPayment createProtectedPayment(CreatePaymentRequest request);

    /** Cancels an unpaid checkout (the trade was cancelled); a no-op when already closed. */
    void cancelPayment(String paymentRef);

    /** Transfers the seller's share of a secured payment to their payout account. */
    Payout releasePayout(PayoutRequest request);

    /** Refunds (part of) a secured payment to the buyer. */
    Refund refund(String paymentRef, Money amount, String reason, String idempotencyKey);

    /**
     * Verifies a webhook's signature and reads it.
     *
     * @throws WebhookSignatureException when the signature is missing, wrong or too old
     * @throws WebhookPayloadException when a correctly signed body cannot be read
     */
    WebhookEvent parseWebhook(String payload, Map<String, String> headers);

    // -------------------------------------------------------------------------------------------
    // Value types
    // -------------------------------------------------------------------------------------------

    /**
     * An amount of money: {@code numeric(12,2)} and an ISO 4217 code.
     *
     * @param amount amount with two decimals
     * @param currency ISO currency (upper case)
     */
    record Money(BigDecimal amount, String currency) {

        public Money {
            amount = amount.setScale(2, RoundingMode.HALF_UP);
            currency = currency.trim().toUpperCase(Locale.ROOT);
        }

        /** "40.00 CAD". */
        public String text() {
            return amount.toPlainString() + " " + currency;
        }
    }

    /**
     * Result of an onboarding step.
     *
     * @param accountRef the provider's account id
     * @param url where the seller continues (provider-hosted page, or the return URL when done)
     * @param status account status after this step
     * @param payoutsEnabled whether payouts can be released to the account
     */
    record SellerOnboarding(
            String accountRef, String url, SellerAccountState status, boolean payoutsEnabled) {}

    /**
     * State of a payout account.
     *
     * @param status status
     * @param payoutsEnabled whether payouts can be released to it
     */
    record SellerAccountStatus(SellerAccountState status, boolean payoutsEnabled) {}

    /**
     * What {@link #createProtectedPayment} needs.
     *
     * @param paymentId our payment id (metadata and idempotency)
     * @param attempt checkout attempt number (1 for the first; idempotency)
     * @param tradeId the trade (transfer group)
     * @param buyerId the paying collector
     * @param sellerAccountRef the seller's payout account
     * @param amount amount charged to the buyer
     * @param platformFee fee the platform keeps from the payout
     * @param description text shown at the checkout (no personal data)
     */
    record CreatePaymentRequest(
            UUID paymentId,
            int attempt,
            UUID tradeId,
            UUID buyerId,
            String sellerAccountRef,
            Money amount,
            Money platformFee,
            String description) {}

    /**
     * A created protected payment.
     *
     * @param paymentRef provider reference (payment intent id)
     * @param checkoutUrl hosted checkout page, if the provider has one (never secret)
     * @param clientSecret client secret for an embedded payment form, returned to the buyer once
     *     and never stored
     */
    record ProtectedPayment(
            String paymentRef, @Nullable String checkoutUrl, @Nullable String clientSecret) {}

    /**
     * What {@link #releasePayout} needs.
     *
     * @param paymentId our payment id (idempotency key {@code payout:<paymentId>})
     * @param paymentRef provider reference of the secured payment
     * @param sellerAccountRef the seller's payout account
     * @param amount amount transferred to the seller
     * @param transferGroup groups the payment and the transfer ({@code trade_<tradeId>})
     */
    record PayoutRequest(
            UUID paymentId,
            String paymentRef,
            String sellerAccountRef,
            Money amount,
            String transferGroup) {}

    /**
     * A released payout.
     *
     * @param payoutRef provider reference of the transfer
     * @param completed whether the money already reached the seller's account balance
     */
    record Payout(String payoutRef, boolean completed) {}

    /**
     * A refund.
     *
     * @param refundRef provider reference of the refund
     * @param succeeded whether it already succeeded (otherwise a webhook confirms it later)
     */
    record Refund(String refundRef, boolean succeeded) {}

    /** What a webhook means for the platform. */
    enum WebhookKind {
        PAYMENT_SECURED,
        PAYMENT_FAILED,
        REFUND_SUCCEEDED,
        REFUND_FAILED,
        PAYOUT_PAID,
        SELLER_ACCOUNT_UPDATED,
        OTHER
    }

    /**
     * A verified webhook, normalised.
     *
     * @param providerEventId the provider's event id (idempotency key)
     * @param type the provider's event type as sent ({@code payment.secured}, {@code
     *     payment_intent.succeeded}, ...)
     * @param kind what it means
     * @param paymentRef payment reference (payment events, payouts)
     * @param accountRef payout account (seller account events)
     * @param account account state (seller account events)
     * @param refundRef refund reference (refund events)
     * @param failureCode provider failure code (failed payments)
     * @param occurredAt when the provider created the event
     */
    record WebhookEvent(
            String providerEventId,
            String type,
            WebhookKind kind,
            @Nullable String paymentRef,
            @Nullable String accountRef,
            @Nullable SellerAccountStatus account,
            @Nullable String refundRef,
            @Nullable String failureCode,
            Instant occurredAt) {}

    /** The webhook's signature is missing, invalid or outside the tolerance. */
    final class WebhookSignatureException extends RuntimeException {

        private final @Nullable String claimedType;

        public WebhookSignatureException(String message, @Nullable String claimedType) {
            super(message);
            this.claimedType = claimedType;
        }

        /** The type the unverified body claims (stored for the admin browser). */
        public @Nullable String claimedType() {
            return claimedType;
        }
    }

    /** A correctly signed webhook body could not be read. */
    final class WebhookPayloadException extends RuntimeException {

        public WebhookPayloadException(String message) {
            super(message);
        }
    }

    /** The provider refused a call or could not be reached (the change is rolled back). */
    final class PaymentProviderException extends RuntimeException {

        public PaymentProviderException(String message, @Nullable Throwable cause) {
            super(message, cause);
        }
    }
}
