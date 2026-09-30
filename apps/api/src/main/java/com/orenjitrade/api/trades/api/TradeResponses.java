package com.orenjitrade.api.trades.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.offers.api.OfferResponses;
import com.orenjitrade.api.offers.api.OfferResponses.OfferPartyResponse;
import com.orenjitrade.api.offers.api.OfferResponses.OfferResponse;
import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.trades.domain.TradeProtection;
import com.orenjitrade.api.trades.domain.TradeRow;
import com.orenjitrade.api.trades.domain.TradeRules.NextAction;
import com.orenjitrade.api.trades.domain.TradeRules.Operation;
import com.orenjitrade.api.trades.domain.TradeStatus;
import com.orenjitrade.api.trades.domain.TradeViews.Detail;
import com.orenjitrade.api.trades.domain.TradeViews.Summary;
import com.orenjitrade.api.trades.domain.TradeViews.TimelineEntry;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response bodies of {@code /api/v1/trades} (Phase 8, payment protection of Phase 9). Never a
 * location, card data or provider references.
 */
public final class TradeResponses {

    private TradeResponses() {}

    /** {@code GET /trades/{id}} and the answers of every trade operation. */
    @Schema(name = "TradeResponse", description = "A trade as one of its two parties sees it")
    public record TradeResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The accepted offer (item, parties, terms, history)")
                    OfferResponse offer,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferRole viewerRole,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferPartyResponse counterparty,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferKind kind,
            @Schema(nullable = true, example = "40.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal cashAmount,
            @Schema(nullable = true, example = "CAD") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) TradeStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean protectionEnabled,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Both parties marked an in-person meetup")
                    boolean meetup,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean buyerMarkedMeetup,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean sellerMarkedMeetup,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant buyerConfirmedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant sellerConfirmedAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) NextAction nextAction,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "What the caller may call now")
                    List<Operation> allowedOperations,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "Oldest first")
                    List<TradeEventResponse> timeline,
            @Schema(
                            nullable = true,
                            description =
                                    "Protected payment (Phase 9); null until the buyer starts the"
                                            + " checkout")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PaymentSummary payment,
            @Schema(
                            nullable = true,
                            description = "Dispute (Phase 9); null unless the buyer opened one")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DisputeSummary dispute,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String cancelReason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant completedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant cancelledAt,
            @Schema(
                            nullable = true,
                            description =
                                    "The seller's shipping confirmation (Phase 9); null until"
                                            + " shipped")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ShipmentSummary shipment) {

        public static TradeResponse from(Detail detail, Instant now) {
            TradeRow row = detail.row();
            OfferResponse offer = OfferResponse.from(detail.offer(), now);
            return new TradeResponse(
                    row.id(),
                    offer,
                    detail.viewerRole(),
                    detail.viewerRole() == OfferRole.BUYER ? offer.seller() : offer.buyer(),
                    row.kind(),
                    row.cashAmount(),
                    row.currency(),
                    row.status(),
                    row.protectionEnabled(),
                    row.meetup(),
                    row.markedMeetup(OfferRole.BUYER),
                    row.markedMeetup(OfferRole.SELLER),
                    row.buyerConfirmedAt(),
                    row.sellerConfirmedAt(),
                    detail.nextAction(),
                    detail.operations(),
                    detail.timeline().stream().map(TradeEventResponse::from).toList(),
                    PaymentSummary.from(detail.protection(), detail.viewerRole()),
                    DisputeSummary.from(detail.protection()),
                    row.cancelReason(),
                    row.createdAt(),
                    row.updatedAt(),
                    row.completedAt(),
                    row.cancelledAt(),
                    ShipmentSummary.from(detail.protection()));
        }
    }

    /** A line of {@code GET /trades}. */
    @Schema(name = "TradeSummary", description = "One of the caller's trades")
    public record TradeSummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID offerId,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PublicInventoryItemResponse item,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferPartyResponse counterparty,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferRole viewerRole,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferKind kind,
            @Schema(nullable = true, example = "40.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal cashAmount,
            @Schema(nullable = true, example = "CAD") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) int tradeItemCount,
            @Schema(requiredMode = RequiredMode.REQUIRED) TradeStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean protectionEnabled,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean meetup,
            @Schema(requiredMode = RequiredMode.REQUIRED) NextAction nextAction,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant completedAt) {

        public static TradeSummaryResponse from(Summary summary, Instant now) {
            TradeRow row = summary.row();
            return new TradeSummaryResponse(
                    row.id(),
                    row.offerId(),
                    OfferResponses.item(summary.offer().item(), now),
                    OfferPartyResponse.from(summary.offer().counterparty()),
                    summary.viewerRole(),
                    row.kind(),
                    row.cashAmount(),
                    row.currency(),
                    summary.offer().tradeItemCount(),
                    row.status(),
                    row.protectionEnabled(),
                    row.meetup(),
                    summary.nextAction(),
                    row.createdAt(),
                    row.updatedAt(),
                    row.completedAt());
        }
    }

    /** One timeline entry. */
    @Schema(name = "TradeEvent", description = "Entry of a trade's timeline")
    public record TradeEventResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "CREATED, MEETUP_PROPOSED, MEETUP_AGREED, PROTECTION_REMOVED,"
                                            + " COMPLETION_CONFIRMED, COMPLETED, CANCELLED; Phase"
                                            + " 9: PAYMENT_STARTED, PAYMENT_FAILED,"
                                            + " PAYMENT_CANCELLED, PAYMENT_SECURED, SHIPPED,"
                                            + " RECEIPT_CONFIRMED, PAYOUT_RELEASED,"
                                            + " DISPUTE_OPENED, DISPUTE_RESOLVED, REFUNDED")
                    String event,
            @Schema(nullable = true, description = "Null for the platform")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable OfferRole actorRole,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Event data (statuses, roles, transfers of a completion, the"
                                            + " cancel reason)")
                    Map<String, Object> details,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        public static TradeEventResponse from(TimelineEntry entry) {
            return new TradeEventResponse(
                    entry.event().id(),
                    entry.event().event(),
                    entry.actorRole(),
                    entry.details(),
                    entry.event().createdAt());
        }
    }

    /** Payment protection of a trade (Phase 9). */
    @Schema(name = "PaymentSummary", description = "Payment protection of a trade (Phase 9)")
    public record PaymentSummary(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "REQUIRES_ACTION, SECURED, PAYOUT_PENDING, PAID_OUT, REFUNDED,"
                                            + " PARTIALLY_REFUNDED, FAILED, CANCELLED")
                    String status,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "40.00") BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(nullable = true) @Nullable Instant securedAt,
            @Schema(description = "fake or stripe") @Nullable String provider,
            @Schema(description = "Fee kept by the platform", example = "2.00")
                    @Nullable BigDecimal platformFee,
            @Schema(description = "What the seller receives with a full payout", example = "38.00")
                    @Nullable BigDecimal sellerAmount,
            @Schema(description = "Refunded to the buyer so far", example = "0.00")
                    @Nullable BigDecimal refundedAmount,
            @Schema(nullable = true, description = "Released to the seller")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal payoutAmount,
            @Schema(description = "An open dispute holds the payout") boolean payoutFrozen,
            @Schema(
                            nullable = true,
                            description =
                                    "Buyer only, while REQUIRES_ACTION: where to complete the"
                                        + " payment (relative /checkout/fake/<ref> with the fake"
                                        + " provider)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String checkoutUrl,
            @Schema(
                            nullable = true,
                            description =
                                    "End of the dispute window (shipment + the configured days);"
                                            + " afterwards the payout is released automatically")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant disputeWindowEndsAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant payoutReleasedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant refundedAt) {

        static @Nullable PaymentSummary from(
                TradeProtection.@Nullable State state, OfferRole viewer) {
            if (state == null || state.payment() == null) {
                return null;
            }
            TradeProtection.Payment payment = state.payment();
            boolean showCheckout =
                    viewer == OfferRole.BUYER && "REQUIRES_ACTION".equals(payment.status());
            return new PaymentSummary(
                    payment.id(),
                    payment.status(),
                    payment.amount(),
                    payment.currency(),
                    payment.securedAt(),
                    payment.provider(),
                    payment.platformFee(),
                    payment.sellerAmount(),
                    payment.refundedAmount(),
                    payment.payoutAmount(),
                    payment.payoutFrozen(),
                    showCheckout ? payment.checkoutUrl() : null,
                    payment.disputeWindowEndsAt(),
                    payment.payoutReleasedAt(),
                    payment.refundedAt());
        }
    }

    /** Dispute of a trade (Phase 9). */
    @Schema(name = "DisputeSummary", description = "Dispute of a trade (Phase 9)")
    public record DisputeSummary(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "OPEN, UNDER_REVIEW, FROZEN, RESOLVED_BUYER, RESOLVED_SELLER,"
                                            + " RESOLVED_SPLIT, CLOSED")
                    String status,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "NOT_RECEIVED, NOT_AS_DESCRIBED, COUNTERFEIT, DAMAGED, OTHER")
                    String reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant openedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant resolvedAt,
            @Schema(nullable = true, description = "Refunded to the buyer by the resolution")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal refundAmount) {

        static @Nullable DisputeSummary from(TradeProtection.@Nullable State state) {
            if (state == null || state.dispute() == null) {
                return null;
            }
            TradeProtection.Dispute dispute = state.dispute();
            return new DisputeSummary(
                    dispute.id(),
                    dispute.status(),
                    dispute.reason(),
                    dispute.openedAt(),
                    dispute.resolvedAt(),
                    dispute.refundAmount());
        }
    }

    /** The seller's shipping confirmation (Phase 9). */
    @Schema(name = "ShipmentSummary", description = "Shipping confirmation of a protected trade")
    public record ShipmentSummary(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String carrier,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String trackingNumber,
            @Schema(nullable = true, description = "The seller's notes for the buyer")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String sellerNotes,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant shippedAt,
            @Schema(nullable = true, description = "When receipt was confirmed")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant deliveredAt) {

        static @Nullable ShipmentSummary from(TradeProtection.@Nullable State state) {
            if (state == null || state.shipment() == null) {
                return null;
            }
            TradeProtection.Shipment shipment = state.shipment();
            return new ShipmentSummary(
                    shipment.carrier(),
                    shipment.trackingNumber(),
                    shipment.notes(),
                    shipment.shippedAt(),
                    shipment.deliveredAt());
        }
    }
}
