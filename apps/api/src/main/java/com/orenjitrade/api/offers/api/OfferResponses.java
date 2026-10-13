package com.orenjitrade.api.offers.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.inventory.api.InventoryResponses.PublicInventoryItemResponse;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.location.api.PlaceResponse;
import com.orenjitrade.api.offers.domain.OfferAction;
import com.orenjitrade.api.offers.domain.OfferEventType;
import com.orenjitrade.api.offers.domain.OfferKind;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.offers.domain.OfferRow;
import com.orenjitrade.api.offers.domain.OfferStatus;
import com.orenjitrade.api.offers.domain.OfferViews.Detail;
import com.orenjitrade.api.offers.domain.OfferViews.HistoryEntry;
import com.orenjitrade.api.offers.domain.OfferViews.Party;
import com.orenjitrade.api.offers.domain.OfferViews.Snapshot;
import com.orenjitrade.api.offers.domain.OfferViews.SnapshotLine;
import com.orenjitrade.api.offers.domain.OfferViews.Summary;
import com.orenjitrade.api.offers.domain.OfferViews.TradeItem;
import com.orenjitrade.api.profiles.api.CollectorProfileResponse.CollectorRating;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Response bodies of {@code /api/v1/offers} (Phase 8). Items are always the public form (never
 * private notes); parties carry their state/province and country, never a city (ADR 0017).
 */
public final class OfferResponses {

    private OfferResponses() {}

    /** {@code GET /offers/{id}} and the answers of every offer action. */
    @Schema(name = "OfferResponse", description = "An offer as one of its two parties sees it")
    public record OfferResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "First proposal of the counter chain")
                    UUID rootOfferId,
            @Schema(
                            nullable = true,
                            description = "The proposal this counter-offer answers (parent)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID counterOf,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "The live proposal of the chain (this id unless a"
                                            + " counter-offer replaced it)")
                    UUID latestOfferId,
            @Schema(
                            nullable = true,
                            description =
                                    "The seller's card (public form); null only after the owner's"
                                            + " account was purged")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PublicInventoryItemResponse item,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferPartyResponse seller,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferPartyResponse buyer,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferRole viewerRole,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferKind kind,
            @Schema(nullable = true, example = "40.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal cashAmount,
            @Schema(nullable = true, example = "CAD") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<OfferTradeItemResponse> tradeItems,
            @Schema(nullable = true, description = "Note of the proposing party")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String message,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferStatus status,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The party expected to answer this proposal")
                    OfferRole currentTurn,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether a counter-offer replaced this proposal")
                    boolean superseded,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant expiresAt,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Optimistic lock: send it back with counter / accept /"
                                            + " decline / cancel (409 STALE_OFFER when it"
                                            + " changed)")
                    int version,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean protectionRequested,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "What the caller may do now")
                    List<OfferAction> allowedActions,
            @Schema(nullable = true, description = "The trade of an accepted proposal")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID tradeId,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "History of the whole counter chain, oldest first")
                    List<OfferEventResponse> history,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant closedAt) {

        public static OfferResponse from(Detail detail, Instant now) {
            OfferRow row = detail.row();
            return new OfferResponse(
                    row.id(),
                    row.rootOfferId(),
                    row.parentOfferId(),
                    detail.latestOfferId(),
                    OfferResponses.item(detail.item(), now),
                    OfferPartyResponse.from(detail.seller()),
                    OfferPartyResponse.from(detail.buyer()),
                    detail.viewerRole(),
                    row.kind(),
                    row.cashAmount(),
                    row.currency(),
                    detail.tradeItems().stream()
                            .map(line -> OfferTradeItemResponse.from(line, now))
                            .toList(),
                    row.message(),
                    row.status(),
                    row.currentTurn(),
                    row.superseded(),
                    row.expiresAt(),
                    row.version(),
                    row.protectionRequested(),
                    detail.allowedActions(),
                    detail.tradeId(),
                    detail.history().stream().map(OfferEventResponse::from).toList(),
                    row.createdAt(),
                    row.updatedAt(),
                    row.closedAt());
        }
    }

    /** A line of {@code GET /offers}. */
    @Schema(name = "OfferSummary", description = "The live proposal of one of the caller's offers")
    public record OfferSummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID rootOfferId,
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
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferRole currentTurn,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether the caller has to answer")
                    boolean yourTurn,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<OfferAction> allowedActions,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant expiresAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) int version,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID tradeId,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant updatedAt) {

        public static OfferSummaryResponse from(Summary summary, Instant now) {
            OfferRow row = summary.row();
            return new OfferSummaryResponse(
                    row.id(),
                    row.rootOfferId(),
                    OfferResponses.item(summary.item(), now),
                    OfferPartyResponse.from(summary.counterparty()),
                    summary.viewerRole(),
                    row.kind(),
                    row.cashAmount(),
                    row.currency(),
                    summary.tradeItemCount(),
                    row.status(),
                    row.currentTurn(),
                    !row.superseded()
                            && row.status().isPending()
                            && row.currentTurn() == summary.viewerRole(),
                    summary.allowedActions(),
                    row.expiresAt(),
                    row.version(),
                    summary.tradeId(),
                    row.createdAt(),
                    row.updatedAt());
        }
    }

    /** A party of an offer or a trade (state/province and country only, never a city). */
    @Schema(
            name = "OfferParty",
            description =
                    "A party of an offer or a trade: handle, display name, avatar, rating and,"
                            + " while discoverable, their state/province and country")
    public record OfferPartyResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "collector1") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED) String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl,
            @Schema(
                            nullable = true,
                            description =
                                    "State/province and country; null unless the collector is"
                                            + " discoverable with a location")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PlaceResponse place,
            @Schema(requiredMode = RequiredMode.REQUIRED) CollectorRating rating) {

        public static OfferPartyResponse from(Party party) {
            PublicOwner owner = party.owner();
            return new OfferPartyResponse(
                    owner.id(),
                    owner.handle(),
                    owner.displayName(),
                    owner.avatarUrl(),
                    owner.place() == null ? null : PlaceResponse.from(owner.place()),
                    new CollectorRating(party.rating().average(), party.rating().count()));
        }
    }

    /** One of the buyer's cards in a proposal. */
    @Schema(name = "OfferTradeItem", description = "A card of the buyer offered in trade")
    public record OfferTradeItemResponse(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID inventoryItemId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "1") int quantity,
            @Schema(
                            nullable = true,
                            description = "Public form of the card; null after an account purge")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PublicInventoryItemResponse item) {

        static OfferTradeItemResponse from(TradeItem line, Instant now) {
            return new OfferTradeItemResponse(
                    line.inventoryItemId(), line.quantity(), OfferResponses.item(line.item(), now));
        }
    }

    /** One entry of an offer's history. */
    @Schema(name = "OfferEvent", description = "Entry of an offer's history")
    public record OfferEventResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, description = "The proposal concerned")
                    UUID offerId,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferEventType event,
            @Schema(nullable = true, description = "Null for the platform (expiry)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable OfferRole actorRole,
            @Schema(nullable = true, description = "Decline / cancel reason")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String reason,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The proposal after the event")
                    OfferTermsResponse terms,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt) {

        static OfferEventResponse from(HistoryEntry entry) {
            return new OfferEventResponse(
                    entry.event().id(),
                    entry.event().offerId(),
                    entry.event().event(),
                    entry.actorRole(),
                    entry.event().reason(),
                    OfferTermsResponse.from(entry.terms()),
                    entry.event().createdAt());
        }
    }

    /** A proposal as stored with a history entry. */
    @Schema(name = "OfferTerms", description = "Snapshot of a proposal")
    public record OfferTermsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferKind kind,
            @Schema(nullable = true, example = "40.00") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable BigDecimal cashAmount,
            @Schema(nullable = true, example = "CAD") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<OfferTermsItemResponse> tradeItems,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String message,
            @Schema(requiredMode = RequiredMode.REQUIRED) OfferRole currentTurn,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant expiresAt,
            @Schema(requiredMode = RequiredMode.REQUIRED) int version) {

        static OfferTermsResponse from(Snapshot snapshot) {
            return new OfferTermsResponse(
                    snapshot.status(),
                    snapshot.kind(),
                    snapshot.cashAmount(),
                    snapshot.currency(),
                    snapshot.tradeItems().stream().map(OfferTermsItemResponse::from).toList(),
                    snapshot.message(),
                    snapshot.currentTurn(),
                    snapshot.expiresAt(),
                    snapshot.version());
        }
    }

    /** A card of a stored proposal. */
    @Schema(name = "OfferTermsItem", description = "A card of a stored proposal")
    public record OfferTermsItemResponse(
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID inventoryItemId,
            @Schema(requiredMode = RequiredMode.REQUIRED) int quantity,
            @Schema(requiredMode = RequiredMode.REQUIRED) String cardName,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String printingCode) {

        static OfferTermsItemResponse from(SnapshotLine line) {
            return new OfferTermsItemResponse(
                    line.inventoryItemId(), line.quantity(), line.cardName(), line.printingCode());
        }
    }

    /** {@code GET/PUT /me/settings/offers}. */
    @Schema(name = "OfferSettings", description = "The caller's offer settings")
    public record OfferSettingsResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Whether MIXED (cash + cards) offers are welcome on the"
                                            + " caller's TRADE_OR_SALE cards")
                    boolean acceptsMixed) {}

    /** Response of {@code POST /internal/jobs/offers-expire}. */
    @Schema(name = "OfferExpiryJobResponse")
    public record OfferExpiryJobResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) int expired) {}

    /**
     * The public form of an offered card. A card that is not public right now (the buyer's cards
     * may come from private binders) never names its binder.
     */
    public static @Nullable PublicInventoryItemResponse item(
            @Nullable InventoryItemView view, Instant now) {
        if (view == null) {
            return null;
        }
        PublicInventoryItemResponse item = PublicInventoryItemResponse.from(view, now);
        if (view.row().effectivePublic() || item.binder() == null) {
            return item;
        }
        return new PublicInventoryItemResponse(
                item.id(),
                item.printing(),
                item.card(),
                null,
                item.quantity(),
                item.condition(),
                item.language(),
                item.edition(),
                item.finish(),
                item.askingPrice(),
                item.currency(),
                item.availability(),
                item.acceptsOffers(),
                item.publicNotes(),
                item.images(),
                item.freshness());
    }
}
