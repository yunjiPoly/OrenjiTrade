package com.orenjitrade.api.payments.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published in the transaction that stored a verified provider webhook ({@code
 * payment_webhook_event} RECEIVED); consumed after commit (Spring Modulith registry, retried after
 * a crash) to apply it. Carries the normalised event so processing does not depend on the raw
 * payload. References only, never card data.
 *
 * @param webhookEventId the stored row
 * @param provider provider id
 * @param providerEventId the provider's event id
 * @param kind normalised meaning ({@code PaymentProvider.WebhookKind} name)
 * @param paymentRef payment reference (payment events)
 * @param accountRef payout account reference (seller account events)
 * @param accountStatus account status (seller account events)
 * @param payoutsEnabled payouts enabled (seller account events)
 * @param refundRef refund reference (refund events)
 * @param failureCode provider failure code (failed payments)
 * @param receivedAt when it was received
 */
public record PaymentWebhookReceived(
        UUID webhookEventId,
        String provider,
        String providerEventId,
        String kind,
        @Nullable String paymentRef,
        @Nullable String accountRef,
        @Nullable String accountStatus,
        boolean payoutsEnabled,
        @Nullable String refundRef,
        @Nullable String failureCode,
        Instant receivedAt) {}
