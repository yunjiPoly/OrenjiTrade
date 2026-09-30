package com.orenjitrade.api.payments.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.payments.api.DisputeResponses.DisputeResponse;
import com.orenjitrade.api.payments.domain.DisputeReason;
import com.orenjitrade.api.payments.domain.DisputeStatus;
import com.orenjitrade.api.payments.domain.DisputeViews.AdminDisputeLine;
import com.orenjitrade.api.payments.domain.DisputeViews.AdminDisputeView;
import com.orenjitrade.api.payments.domain.PaymentAdminService.PaymentDetail;
import com.orenjitrade.api.payments.domain.PaymentAdminService.Transaction;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeNoteRow;
import com.orenjitrade.api.payments.domain.PaymentRows.DisputeRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentEventRow;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.RefundRow;
import com.orenjitrade.api.payments.domain.PaymentRows.ShipmentRow;
import com.orenjitrade.api.payments.domain.PaymentRows.WebhookEventRow;
import com.orenjitrade.api.payments.domain.PaymentSettings.Settings;
import com.orenjitrade.api.payments.domain.PaymentStatus;
import com.orenjitrade.api.payments.domain.WebhookStatus;
import com.orenjitrade.api.profiles.domain.MemberCard;
import com.orenjitrade.api.ratings.domain.RatingService.RatingSummaryView;
import com.orenjitrade.api.reports.api.ReportResponses.HistoryResponse;
import com.orenjitrade.api.trades.api.TradeResponses.TradeEventResponse;
import com.orenjitrade.api.trades.domain.TradeStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import tools.jackson.databind.json.JsonMapper;

/**
 * Admin response bodies of the payments module (Phase 9 "Admin": transactions, disputes, payments,
 * refunds, webhooks, settings). Parties appear by id, handle and display name; never a location,
 * card data or provider account ids.
 */
public final class AdminPaymentResponses {

    private AdminPaymentResponses() {}

    /** A party in the admin views. */
    @Schema(name = "AdminPaymentParty", description = "A party (admin views)")
    public record PartyResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName) {

        static PartyResponse from(UUID id, @Nullable MemberCard card) {
            return card == null
                    ? new PartyResponse(id, "deleted", "Former member")
                    : new PartyResponse(id, card.handle(), card.displayName());
        }
    }

    /** A trade with its protected payment. */
    @Schema(name = "AdminTransaction", description = "A trade with its protected payment")
    public record TransactionResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID paymentId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID tradeId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable TradeStatus tradeStatus,
            @Schema(requiredMode = RequiredMode.REQUIRED) PaymentStatus paymentStatus,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "fake") String provider,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "40.00") BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "5.00") BigDecimal feePercent,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "2.00") BigDecimal platformFee,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "38.00")
                    BigDecimal sellerAmount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "0.00")
                    BigDecimal refundedAmount,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal payoutAmount,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean payoutFrozen,
            @Schema(requiredMode = RequiredMode.REQUIRED) String summary,
            @Schema(requiredMode = RequiredMode.REQUIRED) PartyResponse buyer,
            @Schema(requiredMode = RequiredMode.REQUIRED) PartyResponse seller,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant securedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant shippedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String carrier,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String trackingNumber,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant deliveredAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant disputeWindowEndsAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant payoutReleasedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID disputeId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DisputeStatus disputeStatus,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        static TransactionResponse from(Transaction transaction) {
            PaymentRow payment = transaction.payment();
            @Nullable ShipmentRow shipment = transaction.shipment();
            @Nullable DisputeRow dispute = transaction.dispute();
            return new TransactionResponse(
                    payment.id(),
                    payment.tradeId(),
                    transaction.tradeStatus(),
                    payment.status(),
                    payment.provider(),
                    payment.amount(),
                    payment.currency(),
                    payment.feePercent(),
                    payment.platformFee(),
                    payment.sellerAmount(),
                    payment.refundedAmount(),
                    payment.payoutAmount(),
                    payment.payoutFrozen(),
                    transaction.summary(),
                    PartyResponse.from(payment.buyerId(), transaction.buyer()),
                    PartyResponse.from(payment.sellerId(), transaction.seller()),
                    payment.securedAt(),
                    shipment == null ? null : shipment.shippedAt(),
                    shipment == null ? null : shipment.carrier(),
                    shipment == null ? null : shipment.trackingNumber(),
                    shipment == null ? null : shipment.deliveredAt(),
                    payment.disputeWindowEndsAt(),
                    payment.payoutReleasedAt(),
                    dispute == null ? null : dispute.id(),
                    dispute == null ? null : dispute.status(),
                    payment.createdAt(),
                    payment.updatedAt());
        }
    }

    /** An entry of a payment's history. */
    @Schema(name = "PaymentEvent", description = "Entry of a payment's history")
    public record PaymentEventResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "SECURED") String event,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String providerEventId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID actorId,
            @Schema(requiredMode = RequiredMode.REQUIRED) Map<String, Object> details,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static PaymentEventResponse from(PaymentEventRow row, JsonMapper jsonMapper) {
            return new PaymentEventResponse(
                    row.id(),
                    row.event(),
                    row.providerEventId(),
                    row.actorId(),
                    DisputeResponses.details(row.detailsJson(), jsonMapper),
                    row.createdAt());
        }
    }

    /** A refund. */
    @Schema(name = "PaymentRefund", description = "A refund to the buyer")
    public record RefundResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "10.00") BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) String reason,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "ADMIN, DISPUTE or SYSTEM")
                    String source,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "PENDING, SUCCEEDED or FAILED")
                    String status,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID requestedBy,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant completedAt) {

        static RefundResponse from(RefundRow row) {
            return new RefundResponse(
                    row.id(),
                    row.amount(),
                    row.currency(),
                    row.reason(),
                    row.source(),
                    row.status(),
                    row.requestedBy(),
                    row.createdAt(),
                    row.completedAt());
        }
    }

    /** A stored provider webhook (the payload only in the detail). */
    @Schema(name = "PaymentWebhookEvent", description = "A stored provider webhook")
    public record WebhookEventResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "fake") String provider,
            @Schema(nullable = true, description = "Null when the signature was invalid")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String providerEventId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "payment.secured") String type,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean signatureValid,
            @Schema(requiredMode = RequiredMode.REQUIRED) WebhookStatus status,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID paymentId,
            @Schema(nullable = true, example = "UNKNOWN_PAYMENT")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String error,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant receivedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant processedAt,
            @Schema(type = "object", description = "The event as received (detail only)")
                    @Nullable Object payload) {

        static WebhookEventResponse from(WebhookEventRow row, @Nullable Object payload) {
            return new WebhookEventResponse(
                    row.id(),
                    row.provider(),
                    row.providerEventId(),
                    row.type(),
                    row.signatureValid(),
                    row.status(),
                    row.paymentId(),
                    row.error(),
                    row.receivedAt(),
                    row.processedAt(),
                    payload);
        }
    }

    /** {@code GET /admin/payments/{id}} and the answer of a refund. */
    @Schema(name = "AdminPaymentDetail", description = "A payment with its full history")
    public record PaymentDetailResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) TransactionResponse transaction,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<PaymentEventResponse> events,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<RefundResponse> refunds,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<WebhookEventResponse> webhooks,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether the caller may refund it now")
                    boolean refundAllowed) {

        static PaymentDetailResponse from(PaymentDetail detail, JsonMapper jsonMapper) {
            return new PaymentDetailResponse(
                    TransactionResponse.from(detail.transaction()),
                    detail.events().stream()
                            .map(row -> PaymentEventResponse.from(row, jsonMapper))
                            .toList(),
                    detail.refunds().stream().map(RefundResponse::from).toList(),
                    detail.webhooks().stream()
                            .map(row -> WebhookEventResponse.from(row, null))
                            .toList(),
                    detail.refundAllowed());
        }
    }

    /** A line of the admin dispute queue. */
    @Schema(name = "AdminDisputeSummary", description = "A dispute in the admin queue")
    public record DisputeSummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID tradeId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID paymentId,
            @Schema(requiredMode = RequiredMode.REQUIRED) DisputeStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) DisputeReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant openedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal amount,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String currency,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PartyResponse buyer,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PartyResponse seller) {

        static DisputeSummaryResponse from(AdminDisputeLine line) {
            DisputeRow dispute = line.dispute();
            @Nullable PaymentRow payment = line.payment();
            return new DisputeSummaryResponse(
                    dispute.id(),
                    dispute.tradeId(),
                    dispute.paymentId(),
                    dispute.status(),
                    dispute.reason(),
                    dispute.openedAt(),
                    dispute.resolvedAt(),
                    payment == null ? null : payment.amount(),
                    payment == null ? null : payment.currency(),
                    payment == null ? null : PartyResponse.from(payment.buyerId(), line.buyer()),
                    payment == null ? null : PartyResponse.from(payment.sellerId(), line.seller()));
        }
    }

    /** An internal note. */
    @Schema(name = "DisputeNote", description = "Internal admin note (never shown to parties)")
    public record NoteResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID authorId,
            @Schema(requiredMode = RequiredMode.REQUIRED) String body,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static NoteResponse from(DisputeNoteRow row) {
            return new NoteResponse(row.id(), row.authorId(), row.body(), row.createdAt());
        }
    }

    /** Averages of a party's visible ratings. */
    @Schema(name = "DisputePartyRatings", description = "Rating summary of a party")
    public record RatingsResponse(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Double average,
            @Schema(requiredMode = RequiredMode.REQUIRED) int count) {

        static RatingsResponse from(RatingSummaryView view) {
            return new RatingsResponse(view.average(), view.count());
        }
    }

    /** {@code GET /admin/disputes/{id}} and the answers of the admin dispute actions. */
    @Schema(name = "AdminDispute", description = "A dispute with its full history (admin)")
    public record AdminDisputeResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) DisputeResponse dispute,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Internal admin notes (never shown to the parties)")
                    List<NoteResponse> internalNotes,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<TradeEventResponse> tradeTimeline,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<PaymentEventResponse> paymentEvents,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<RefundResponse> refunds,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<WebhookEventResponse> webhooks,
            @Schema(requiredMode = RequiredMode.REQUIRED) HistoryResponse buyerHistory,
            @Schema(requiredMode = RequiredMode.REQUIRED) HistoryResponse sellerHistory,
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingsResponse buyerRatings,
            @Schema(requiredMode = RequiredMode.REQUIRED) RatingsResponse sellerRatings) {

        static AdminDisputeResponse from(AdminDisputeView view, JsonMapper jsonMapper) {
            return new AdminDisputeResponse(
                    DisputeResponse.from(view.view(), jsonMapper),
                    view.notes().stream().map(NoteResponse::from).toList(),
                    view.tradeTimeline().stream().map(TradeEventResponse::from).toList(),
                    view.paymentEvents().stream()
                            .map(row -> PaymentEventResponse.from(row, jsonMapper))
                            .toList(),
                    view.refunds().stream().map(RefundResponse::from).toList(),
                    view.webhooks().stream()
                            .map(row -> WebhookEventResponse.from(row, null))
                            .toList(),
                    HistoryResponse.from(view.buyerHistory()),
                    HistoryResponse.from(view.sellerHistory()),
                    RatingsResponse.from(view.buyerRatings()),
                    RatingsResponse.from(view.sellerRatings()));
        }
    }

    /** {@code GET/PUT /admin/payments/settings}. */
    @Schema(name = "PaymentSettings", description = "Configurable payment rules (ADR 0014)")
    public record SettingsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "7") int disputeWindowDays,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "5.00")
                    BigDecimal platformFeePercent,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean autoReleaseEnabled,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "48") int releaseReminderHours,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean adminRefundsEnabled,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID updatedBy) {

        static SettingsResponse from(Settings settings, Map<String, Object> lastChange) {
            return new SettingsResponse(
                    settings.disputeWindowDays(),
                    settings.platformFeePercent(),
                    settings.autoReleaseEnabled(),
                    settings.releaseReminderHours(),
                    settings.adminRefundsEnabled(),
                    (Instant) lastChange.get("updatedAt"),
                    (UUID) lastChange.get("updatedBy"));
        }
    }
}
