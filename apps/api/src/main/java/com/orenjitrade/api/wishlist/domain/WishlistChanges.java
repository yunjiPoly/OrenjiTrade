package com.orenjitrade.api.wishlist.domain;

import java.math.BigDecimal;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Inputs of the wishlist service. */
public final class WishlistChanges {

    private WishlistChanges() {}

    /**
     * A new wishlist item; {@code null} means the documented default.
     *
     * @param cardId wished card (or derived from the printing)
     * @param printingId wished printing ({@code null} = any printing of the card)
     * @param rarity required rarity (a rarity of the game)
     * @param conditionMin worst acceptable condition (a condition of the game)
     * @param edition required edition
     * @param language required language
     * @param maxPrice maximum asking price
     * @param currency currency of the maximum price (default CAD)
     * @param tradePreference default ANY
     * @param notes private notes
     * @param active default true
     */
    public record NewWishlistItem(
            @Nullable UUID cardId,
            @Nullable UUID printingId,
            @Nullable String rarity,
            @Nullable String conditionMin,
            @Nullable String edition,
            @Nullable String language,
            @Nullable BigDecimal maxPrice,
            @Nullable String currency,
            @Nullable TradePreference tradePreference,
            @Nullable String notes,
            @Nullable Boolean active) {}

    /**
     * A partial update: only the fields in {@code present} change; present nullable fields may be
     * cleared with {@code null}.
     *
     * @param present names of the members present in the request body
     * @param printingId another printing of the same card, or {@code null} for any printing
     * @param rarity rarity or {@code null}
     * @param conditionMin minimum condition or {@code null}
     * @param edition edition or {@code null}
     * @param language language or {@code null}
     * @param maxPrice maximum price or {@code null}
     * @param currency currency (not null)
     * @param tradePreference trade preference (not null)
     * @param notes notes ({@code null} clears)
     * @param active active flag (not null)
     */
    public record WishlistPatch(
            Set<String> present,
            @Nullable UUID printingId,
            @Nullable String rarity,
            @Nullable String conditionMin,
            @Nullable String edition,
            @Nullable String language,
            @Nullable BigDecimal maxPrice,
            @Nullable String currency,
            @Nullable TradePreference tradePreference,
            @Nullable String notes,
            @Nullable Boolean active) {

        public WishlistPatch {
            present = Set.copyOf(present);
        }

        public boolean has(String field) {
            return present.contains(field);
        }
    }
}
