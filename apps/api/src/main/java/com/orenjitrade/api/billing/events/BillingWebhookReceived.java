package com.orenjitrade.api.billing.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published in the transaction that stored a verified billing webhook ({@code
 * billing_webhook_event} RECEIVED); consumed after commit (Spring Modulith registry, retried after
 * a crash) to apply it. Carries the normalised event; references only, never card data.
 *
 * @param webhookEventId the stored row
 * @param provider provider id
 * @param providerEventId the provider's event id
 * @param kind normalised meaning ({@code BillingProvider.EventKind} name)
 * @param checkoutRef checkout reference
 * @param subscriptionRef provider subscription reference
 * @param periodStart start of the paid period
 * @param periodEnd end of the paid period
 * @param failureCode provider failure code
 * @param receivedAt when it was received
 */
public record BillingWebhookReceived(
        UUID webhookEventId,
        String provider,
        String providerEventId,
        String kind,
        @Nullable String checkoutRef,
        @Nullable String subscriptionRef,
        @Nullable Instant periodStart,
        @Nullable Instant periodEnd,
        @Nullable String failureCode,
        Instant receivedAt) {}
