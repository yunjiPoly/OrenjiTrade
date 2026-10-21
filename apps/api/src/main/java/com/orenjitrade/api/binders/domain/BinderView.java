package com.orenjitrade.api.binders.domain;

import com.orenjitrade.api.delisting.domain.FreshnessState;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A binder as read from the database, with its live effective public visibility.
 *
 * @param id binder id
 * @param ownerId owner account
 * @param name name (1-80 characters)
 * @param description description (at most 1 000 characters)
 * @param kind purpose
 * @param visibility the owner's choice
 * @param publicUntil end of a TEMPORARILY_PUBLIC publication
 * @param sortOrder position in the owner's list
 * @param coverPrintingId printing whose image is the cover, when chosen
 * @param itemCount non-deleted items (maintained by a trigger)
 * @param freshnessState derived freshness
 * @param confirmedAt last owner confirmation
 * @param createdAt creation
 * @param updatedAt last owner edit
 * @param lastOwnerActivityAt last owner activity on the binder or its items
 * @param effectivePublic whether the binder is public right now (rules of {@link
 *     PublicVisibilityRules})
 * @param sellsAsCore "Sell as a deck core": offered as one bundle (stage R3)
 * @param askingPriceText the deck core's asking price as typed, {@code null} without one
 * @param askingPrice the amount of a plain-amount price text, in {@code currency}
 * @param currency ISO 4217 currency of {@code askingPrice}
 * @param soldAt when the deck core was sold (a sold binder is never public), {@code null} if not
 * @param gameId the one game whose cards the binder holds (stage G)
 * @param game that game's slug
 * @param gameFollowsCards made without a game (the paused web): while it holds no card, the first
 *     card filed in it sets its game
 */
public record BinderView(
        UUID id,
        UUID ownerId,
        String name,
        String description,
        BinderKind kind,
        ListingVisibility visibility,
        @Nullable Instant publicUntil,
        int sortOrder,
        @Nullable UUID coverPrintingId,
        int itemCount,
        FreshnessState freshnessState,
        Instant confirmedAt,
        Instant createdAt,
        Instant updatedAt,
        Instant lastOwnerActivityAt,
        boolean effectivePublic,
        boolean sellsAsCore,
        @Nullable String askingPriceText,
        @Nullable BigDecimal askingPrice,
        String currency,
        @Nullable Instant soldAt,
        UUID gameId,
        String game,
        boolean gameFollowsCards) {

    /**
     * Whether the binder shows in public lists (a collector's binders, search, the map) without
     * holding a public card: a deck core needs no cards (spec 2026-10-14, section 7). The caller
     * has checked {@link #effectivePublic()}, which leaves sold binders out.
     */
    public boolean listedWithoutCards() {
        return sellsAsCore && soldAt == null;
    }

    /** The same binder holding the cards of another game ({@link #gameFollowsCards}). */
    public BinderView withGame(UUID otherGameId, String otherGame) {
        return new BinderView(
                id,
                ownerId,
                name,
                description,
                kind,
                visibility,
                publicUntil,
                sortOrder,
                coverPrintingId,
                itemCount,
                freshnessState,
                confirmedAt,
                createdAt,
                updatedAt,
                lastOwnerActivityAt,
                effectivePublic,
                sellsAsCore,
                askingPriceText,
                askingPrice,
                currency,
                soldAt,
                otherGameId,
                otherGame,
                gameFollowsCards);
    }
}
