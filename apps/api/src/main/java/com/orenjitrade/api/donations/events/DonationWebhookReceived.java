package com.orenjitrade.api.donations.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published in the transaction that stored a verified donation webhook; consumed after commit
 * (Spring Modulith registry) to apply it. References only.
 *
 * @param webhookEventId the stored row
 * @param provider provider id
 * @param providerEventId provider event id
 * @param kind normalised meaning ({@code DonationProvider.EventKind} name)
 * @param checkoutRef checkout reference
 * @param failureCode provider failure code
 * @param receivedAt when it was received
 */
public record DonationWebhookReceived(
        UUID webhookEventId,
        String provider,
        String providerEventId,
        String kind,
        @Nullable String checkoutRef,
        @Nullable String failureCode,
        Instant receivedAt) {}
