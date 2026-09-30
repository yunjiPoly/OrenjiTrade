package com.orenjitrade.api.billing.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Rows of the subscription tables (V090), read by the billing module only. */
public final class SubscriptionRows {

    private SubscriptionRows() {}

    /**
     * A subscription with its plan's code and name.
     *
     * @param id subscription id
     * @param userId the member
     * @param planId plan
     * @param planCode plan code
     * @param planName plan display name
     * @param status status
     * @param provider billing provider id
     * @param providerRef confidential provider subscription reference
     * @param checkoutRef checkout reference
     * @param checkoutUrl where the member pays while PENDING
     * @param amount price per period
     * @param currency ISO 4217 code
     * @param currentPeriodStart start of the paid period
     * @param currentPeriodEnd end of the paid period
     * @param cancelAtPeriodEnd the member cancelled; ends at the period end
     * @param cancelRequestedAt when the cancellation was asked for
     * @param activatedAt first activation
     * @param endedAt end (CANCELLED / EXPIRED)
     * @param failureCode last provider failure code
     * @param createdAt creation
     * @param updatedAt last change
     * @param version optimistic counter
     */
    public record SubscriptionRow(
            UUID id,
            UUID userId,
            UUID planId,
            String planCode,
            String planName,
            SubscriptionStatus status,
            String provider,
            @Nullable String providerRef,
            @Nullable String checkoutRef,
            @Nullable String checkoutUrl,
            BigDecimal amount,
            String currency,
            @Nullable Instant currentPeriodStart,
            @Nullable Instant currentPeriodEnd,
            boolean cancelAtPeriodEnd,
            @Nullable Instant cancelRequestedAt,
            @Nullable Instant activatedAt,
            @Nullable Instant endedAt,
            @Nullable String failureCode,
            Instant createdAt,
            Instant updatedAt,
            int version) {}

    /**
     * A history entry.
     *
     * @param id entry id
     * @param event event name
     * @param providerEventId provider webhook that caused it
     * @param actorId member or admin; {@code null} for the provider and jobs
     * @param detailsJson details as JSON text
     * @param createdAt when
     */
    public record SubscriptionEventRow(
            UUID id,
            String event,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            String detailsJson,
            Instant createdAt) {}

    /**
     * A stored billing webhook.
     *
     * @param id row id
     * @param provider provider id
     * @param providerEventId provider event id (null for invalid signatures)
     * @param type provider event type
     * @param signatureValid whether the signature was verified
     * @param status processing status
     * @param subscriptionId linked subscription
     * @param payload the body (admin detail only)
     * @param error error code
     * @param receivedAt when received
     * @param processedAt when processed
     */
    public record BillingWebhookRow(
            UUID id,
            String provider,
            @Nullable String providerEventId,
            String type,
            boolean signatureValid,
            WebhookState status,
            @Nullable UUID subscriptionId,
            @Nullable String payload,
            @Nullable String error,
            Instant receivedAt,
            @Nullable Instant processedAt) {}

    /** Processing status of a stored webhook. */
    public enum WebhookState {
        RECEIVED,
        PROCESSED,
        IGNORED,
        FAILED
    }
}
