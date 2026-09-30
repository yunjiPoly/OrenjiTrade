package com.orenjitrade.api.payments.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Stored rows of the payments module (read by its repositories; never leave the module). */
public final class PaymentRows {

    private PaymentRows() {}

    /** A {@code payment} row. */
    public record PaymentRow(
            UUID id,
            UUID tradeId,
            UUID buyerId,
            UUID sellerId,
            String provider,
            String providerRef,
            PaymentStatus status,
            BigDecimal amount,
            String currency,
            BigDecimal feePercent,
            BigDecimal platformFee,
            BigDecimal sellerAmount,
            BigDecimal refundedAmount,
            @Nullable BigDecimal payoutAmount,
            @Nullable String payoutRef,
            boolean payoutFrozen,
            @Nullable String checkoutUrl,
            @Nullable String failureCode,
            @Nullable Instant securedAt,
            @Nullable Instant payoutReleasedAt,
            @Nullable Instant refundedAt,
            @Nullable Instant disputeWindowEndsAt,
            @Nullable Instant releaseRemindedAt,
            Instant createdAt,
            Instant updatedAt,
            int version) {

        /** What can still be refunded to the buyer. */
        public BigDecimal refundable() {
            return amount.subtract(refundedAmount);
        }

        public boolean involves(UUID userId) {
            return buyerId.equals(userId) || sellerId.equals(userId);
        }

        public PaymentProvider.Money money(BigDecimal value) {
            return new PaymentProvider.Money(value, currency);
        }
    }

    /** A {@code payment_event} row. */
    public record PaymentEventRow(
            UUID id,
            UUID paymentId,
            String event,
            @Nullable String providerEventId,
            @Nullable UUID actorId,
            String detailsJson,
            Instant createdAt) {}

    /** A {@code payment_refund} row. */
    public record RefundRow(
            UUID id,
            UUID paymentId,
            @Nullable String providerRefundId,
            BigDecimal amount,
            String currency,
            String reason,
            String source,
            String status,
            @Nullable UUID requestedBy,
            Instant createdAt,
            @Nullable Instant completedAt) {}

    /** A {@code seller_account} row. */
    public record SellerAccountRow(
            UUID userId,
            String provider,
            @Nullable String providerAccountId,
            SellerAccountState status,
            boolean payoutsEnabled,
            Instant createdAt,
            Instant updatedAt) {

        /** Whether payouts can be released to this account (ACTIVE with payouts enabled). */
        public boolean ready(String activeProvider) {
            return status == SellerAccountState.ACTIVE
                    && payoutsEnabled
                    && providerAccountId != null
                    && provider.equals(activeProvider);
        }
    }

    /** A {@code payment_webhook_event} row. */
    public record WebhookEventRow(
            UUID id,
            String provider,
            @Nullable String providerEventId,
            String type,
            boolean signatureValid,
            WebhookStatus status,
            @Nullable UUID paymentId,
            @Nullable String payloadJson,
            @Nullable String error,
            Instant receivedAt,
            @Nullable Instant processedAt) {}

    /** A {@code shipment} row. */
    public record ShipmentRow(
            UUID id,
            UUID tradeId,
            @Nullable String carrier,
            @Nullable String trackingNumber,
            @Nullable String notes,
            @Nullable UUID shippedBy,
            Instant shippedAt,
            @Nullable Instant deliveredAt) {}

    /** A {@code dispute} row. */
    public record DisputeRow(
            UUID id,
            UUID tradeId,
            UUID paymentId,
            @Nullable UUID openedBy,
            DisputeReason reason,
            String description,
            DisputeStatus status,
            Instant openedAt,
            Instant updatedAt,
            @Nullable Instant frozenAt,
            @Nullable UUID frozenBy,
            @Nullable Instant resolvedAt,
            @Nullable UUID resolvedBy,
            @Nullable String resolutionNote,
            @Nullable BigDecimal refundAmount,
            int version) {}

    /** A {@code dispute_evidence} row. */
    public record EvidenceRow(
            UUID id,
            UUID disputeId,
            @Nullable UUID submittedBy,
            String partyRole,
            EvidenceKind kind,
            @Nullable String body,
            @Nullable String storageKey,
            @Nullable String url,
            @Nullable String contentType,
            @Nullable Integer sizeBytes,
            Instant createdAt) {}

    /** A {@code dispute_event} row. */
    public record DisputeEventRow(
            UUID id,
            UUID disputeId,
            @Nullable UUID actorId,
            String event,
            String detailsJson,
            Instant createdAt) {}

    /** A {@code dispute_message} row. */
    public record DisputeMessageRow(
            UUID id,
            UUID disputeId,
            @Nullable UUID authorId,
            String authorRole,
            String body,
            Instant createdAt) {}

    /** A {@code dispute_note} row. */
    public record DisputeNoteRow(
            UUID id, UUID disputeId, @Nullable UUID authorId, String body, Instant createdAt) {}
}
