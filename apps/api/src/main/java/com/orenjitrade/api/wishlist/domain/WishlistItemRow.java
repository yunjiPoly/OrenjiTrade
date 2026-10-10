package com.orenjitrade.api.wishlist.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored wish.
 *
 * @param id item id
 * @param ownerId owner
 * @param gameSlug game of the card
 * @param cardId card (always set by the API)
 * @param printingId printing, {@code null} = any printing of the card
 * @param rarity rarity of an "any printing" wish, {@code null} = any rarity
 * @param publicNote public note ({@code ""} when none)
 * @param nearMintOnly only Near Mint (or better) copies fit
 * @param priceTerm price term label ({@code "85% TCG"}) or {@code null}
 * @param createdAt creation
 * @param updatedAt last edit
 */
public record WishlistItemRow(
        UUID id,
        UUID ownerId,
        String gameSlug,
        @Nullable UUID cardId,
        @Nullable UUID printingId,
        @Nullable String rarity,
        String publicNote,
        boolean nearMintOnly,
        @Nullable String priceTerm,
        Instant createdAt,
        Instant updatedAt) {}
