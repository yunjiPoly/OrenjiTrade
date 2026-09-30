package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Read models of the offers module (assembled by {@link OfferService}). */
public final class OfferViews {

    private OfferViews() {}

    /**
     * A party as the other party sees them: the owner block (region label and distance bucket only,
     * never a point) and their rating summary.
     *
     * @param owner handle, display name, avatar, approximate location
     * @param rating ratings received
     */
    public record Party(PublicOwner owner, RatingSummary rating) {}

    /**
     * One of the buyer's cards in a proposal.
     *
     * @param inventoryItemId the buyer's item ({@code null} after an account purge)
     * @param quantity copies offered
     * @param item the item ({@code null} when it no longer exists)
     */
    public record TradeItem(
            @Nullable UUID inventoryItemId, int quantity, @Nullable InventoryItemView item) {}

    /**
     * The terms of a proposal as stored with a history entry.
     *
     * @param status status after the event
     * @param kind kind
     * @param cashAmount cash part
     * @param currency currency of the cash part
     * @param tradeItems the buyer's cards
     * @param message the proposing party's note
     * @param currentTurn the party expected to answer
     * @param expiresAt expiry
     * @param version version after the event
     */
    public record Snapshot(
            OfferStatus status,
            OfferKind kind,
            @Nullable BigDecimal cashAmount,
            @Nullable String currency,
            List<SnapshotLine> tradeItems,
            @Nullable String message,
            OfferRole currentTurn,
            Instant expiresAt,
            int version) {}

    /**
     * A card of a stored snapshot.
     *
     * @param inventoryItemId the buyer's item
     * @param quantity copies offered
     * @param cardName card name at the time
     * @param printingCode printing code at the time
     */
    public record SnapshotLine(
            @Nullable UUID inventoryItemId,
            int quantity,
            String cardName,
            @Nullable String printingCode) {}

    /**
     * One history entry.
     *
     * @param event the stored event
     * @param actorRole the acting party's role ({@code null} for the platform)
     * @param terms the proposal after the event
     */
    public record HistoryEntry(
            OfferEventRow event, @Nullable OfferRole actorRole, Snapshot terms) {}

    /**
     * An offer as one of its parties sees it ({@code GET /offers/{id}}).
     *
     * @param row the proposal
     * @param item the seller's item ({@code null} only after an account purge)
     * @param tradeItems the buyer's cards
     * @param seller the seller
     * @param buyer the buyer
     * @param viewerRole the viewer's role
     * @param allowedActions what the viewer may do now
     * @param latestOfferId the live proposal of the chain (this one unless superseded)
     * @param history the whole chain's history, oldest first
     * @param tradeId the trade of an accepted proposal
     */
    public record Detail(
            OfferRow row,
            @Nullable InventoryItemView item,
            List<TradeItem> tradeItems,
            Party seller,
            Party buyer,
            OfferRole viewerRole,
            List<OfferAction> allowedActions,
            UUID latestOfferId,
            List<HistoryEntry> history,
            @Nullable UUID tradeId) {}

    /**
     * A line of the offers inbox ({@code GET /offers}).
     *
     * @param row the live proposal of the chain
     * @param item the seller's item
     * @param counterparty the other party
     * @param viewerRole the viewer's role
     * @param tradeItemCount the buyer's cards in the proposal
     * @param allowedActions what the viewer may do now
     * @param tradeId the trade of an accepted proposal
     */
    public record Summary(
            OfferRow row,
            @Nullable InventoryItemView item,
            Party counterparty,
            OfferRole viewerRole,
            int tradeItemCount,
            List<OfferAction> allowedActions,
            @Nullable UUID tradeId) {}
}
