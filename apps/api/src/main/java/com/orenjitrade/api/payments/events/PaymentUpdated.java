package com.orenjitrade.api.payments.events;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Published inside the transaction of every payment change the parties hear about (Phase 9):
 * SECURED, FAILED, SHIPPED, RELEASE_REMINDER, PAYOUT_RELEASED, REFUNDED, SELLER_ONBOARDING_NEEDED.
 * Consumed after commit for notifications and analytics. Ids and codes only (never amounts or
 * provider references).
 *
 * @param paymentId the payment ({@code null} for SELLER_ONBOARDING_NEEDED before any payment)
 * @param tradeId the trade
 * @param event what happened
 * @param status the payment's status after the event ({@code null} without a payment)
 * @param provider provider id
 * @param buyerId the buyer
 * @param sellerId the seller
 * @param actorId the acting account, {@code null} for the platform
 * @param occurredAt when
 */
public record PaymentUpdated(
        @Nullable UUID paymentId,
        UUID tradeId,
        String event,
        @Nullable String status,
        String provider,
        UUID buyerId,
        UUID sellerId,
        @Nullable UUID actorId,
        Instant occurredAt) {}
