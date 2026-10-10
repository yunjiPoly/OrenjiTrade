package com.orenjitrade.api.wishlist.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored wishlist item with its live match count.
 *
 * @param id item id
 * @param ownerId owner
 * @param gameSlug game of the card
 * @param cardId card (always set by the API)
 * @param printingId printing, {@code null} = any printing of the card
 * @param rarity required rarity
 * @param conditionMin worst acceptable condition
 * @param edition required edition
 * @param language required language
 * @param maxPrice maximum asking price
 * @param currency currency of the maximum price
 * @param tradePreference trade preference
 * @param notes private notes of the owner
 * @param active whether new publications are matched
 * @param createdAt creation
 * @param updatedAt last edit
 * @param lastMatchedAt last new match
 * @param matchCount undismissed matches whose item is public now (blocked owners excluded)
 */
public record WishlistItemRow(
        UUID id,
        UUID ownerId,
        String gameSlug,
        @Nullable UUID cardId,
        @Nullable UUID printingId,
        @Nullable String rarity,
        @Nullable String conditionMin,
        @Nullable String edition,
        @Nullable String language,
        @Nullable BigDecimal maxPrice,
        String currency,
        TradePreference tradePreference,
        String notes,
        boolean active,
        Instant createdAt,
        Instant updatedAt,
        @Nullable Instant lastMatchedAt,
        long matchCount) {}
