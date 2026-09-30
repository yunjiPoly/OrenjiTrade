package com.orenjitrade.api.donations.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Rows of the donation tables (V093), read by the donations module only. */
public final class DonationRows {

    private DonationRows() {}

    /** Status of a donation ({@code donation.status}). */
    public enum DonationStatus {
        PENDING,
        SUCCEEDED,
        FAILED,
        REFUNDED
    }

    /** Processing status of a stored webhook. */
    public enum WebhookState {
        RECEIVED,
        PROCESSED,
        IGNORED,
        FAILED
    }

    /**
     * A donation.
     *
     * @param id donation id
     * @param userId the donor ({@code null} once the account row is gone)
     * @param amount amount
     * @param currency ISO 4217 code
     * @param provider provider id
     * @param providerRef checkout reference
     * @param checkoutUrl where the donor pays while PENDING
     * @param status status
     * @param message optional note to the team (admins and the donor only)
     * @param publicThanks opt-in to the public supporters list
     * @param failureCode last provider failure
     * @param succeededAt when it succeeded
     * @param refundedAt when it was refunded
     * @param createdAt creation
     * @param updatedAt last change
     */
    public record DonationRow(
            UUID id,
            @Nullable UUID userId,
            BigDecimal amount,
            String currency,
            String provider,
            @Nullable String providerRef,
            @Nullable String checkoutUrl,
            DonationStatus status,
            @Nullable String message,
            boolean publicThanks,
            @Nullable String failureCode,
            @Nullable Instant succeededAt,
            @Nullable Instant refundedAt,
            Instant createdAt,
            Instant updatedAt) {}

    /**
     * A stored donation webhook.
     *
     * @param id row id
     * @param provider provider id
     * @param providerEventId provider event id
     * @param type provider event type
     * @param signatureValid whether the signature was verified
     * @param status processing status
     * @param donationId linked donation
     * @param payload body (admin detail only)
     * @param error error code
     * @param receivedAt when received
     * @param processedAt when processed
     */
    public record DonationWebhookRow(
            UUID id,
            String provider,
            @Nullable String providerEventId,
            String type,
            boolean signatureValid,
            WebhookState status,
            @Nullable UUID donationId,
            @Nullable String payload,
            @Nullable String error,
            Instant receivedAt,
            @Nullable Instant processedAt) {}

    /**
     * A public supporter (opt-in, names only).
     *
     * @param userId the donor (never returned)
     * @param lastSucceededAt latest succeeded donation
     */
    public record SupporterRow(UUID userId, Instant lastSucceededAt) {}

    /**
     * Totals of succeeded donations per currency (admin).
     *
     * @param currency ISO 4217 code
     * @param total sum of succeeded (not refunded) donations
     * @param count number of them
     */
    public record CurrencyTotal(String currency, BigDecimal total, long count) {}
}
