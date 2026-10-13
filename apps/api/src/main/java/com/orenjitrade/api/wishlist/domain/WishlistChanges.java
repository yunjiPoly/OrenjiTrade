package com.orenjitrade.api.wishlist.domain;

import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Inputs of the wishlist service. */
public final class WishlistChanges {

    private WishlistChanges() {}

    /**
     * A new wish: which copy (the card with any printing, optionally of one rarity, or one
     * printing), a public note, "Near Mint only" and at most one price term.
     *
     * @param cardId wished card (or derived from the printing)
     * @param printingId wished printing ({@code null} = any printing of the card)
     * @param rarity rarity of an "any printing" wish ({@code null} = any rarity)
     * @param note public note ({@code null} = none)
     * @param nearMintOnly only Near Mint (or better) copies ({@code null} = false)
     * @param priceTerm one of the admin-configured price terms ({@code null} = none)
     */
    public record NewWishlistItem(
            @Nullable UUID cardId,
            @Nullable UUID printingId,
            @Nullable String rarity,
            @Nullable String note,
            @Nullable Boolean nearMintOnly,
            @Nullable String priceTerm) {}

    /**
     * A partial update: only the fields in {@code present} change; present nullable fields may be
     * cleared with {@code null}.
     *
     * @param present names of the members present in the request body
     * @param printingId another printing of the same card, or {@code null} for any printing
     * @param rarity rarity of an "any printing" wish, or {@code null}
     * @param note public note ({@code null} clears)
     * @param nearMintOnly Near Mint only (not null)
     * @param priceTerm price term or {@code null} for none
     */
    public record WishlistPatch(
            Set<String> present,
            @Nullable UUID printingId,
            @Nullable String rarity,
            @Nullable String note,
            @Nullable Boolean nearMintOnly,
            @Nullable String priceTerm) {

        public WishlistPatch {
            present = Set.copyOf(present);
        }

        public boolean has(String field) {
            return present.contains(field);
        }
    }
}
