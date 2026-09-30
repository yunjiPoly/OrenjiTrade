package com.orenjitrade.api.trades.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.offers.api.OfferResponses;
import com.orenjitrade.api.offers.api.OfferResponses.OfferPartyResponse;
import com.orenjitrade.api.offers.api.OfferResponses.OfferResponse;
import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferRole;
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

/** Response bodies of {@code /api/v1/trades} (Phase 8). Never a location or payment data. */
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
            @Schema(nullable = true, description = "Payment protection (Phase 9); null for now")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PaymentSummary payment,
            @Schema(nullable = true, description = "Dispute (Phase 9); null for now")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DisputeSummary dispute,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String cancelReason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant completedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant cancelledAt) {

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
                    null,
                    null,
                    row.cancelReason(),
                    row.createdAt(),
                    row.updatedAt(),
                    row.completedAt(),
                    row.cancelledAt());
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
                                            + " COMPLETION_CONFIRMED, COMPLETED, CANCELLED (Phase"
                                            + " 9 adds payment, shipping and dispute events)")
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

        static TradeEventResponse from(TimelineEntry entry) {
            return new TradeEventResponse(
                    entry.event().id(),
                    entry.event().event(),
                    entry.actorRole(),
                    entry.details(),
                    entry.event().createdAt());
        }
    }

    /** Payment protection of a trade (Phase 9 fills it; always null in Phase 8). */
    @Schema(name = "PaymentSummary", description = "Payment protection of a trade (Phase 9)")
    public record PaymentSummary(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String status,
            @Schema(requiredMode = RequiredMode.REQUIRED) BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED) String currency,
            @Schema(nullable = true) @Nullable Instant securedAt) {}

    /** Dispute of a trade (Phase 9 fills it; always null in Phase 8). */
    @Schema(name = "DisputeSummary", description = "Dispute of a trade (Phase 9)")
    public record DisputeSummary(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) String status,
            @Schema(requiredMode = RequiredMode.REQUIRED) String reason,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant openedAt) {}
}
