package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.cards.domain.PrintingSummary;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A wishlist item with its catalog references.
 *
 * @param row the stored item
 * @param card the wished card, {@code null} when the catalog no longer has it
 * @param printing the wished printing, {@code null} for any printing
 */
public record WishlistItemView(
        WishlistItemRow row, @Nullable CardRef card, @Nullable PrintingSummary printing) {

    /**
     * The card of a wishlist item.
     *
     * @param id card id
     * @param name card name
     * @param imageUrl front image of the earliest printing (placeholder when none)
     */
    public record CardRef(UUID id, String name, @Nullable String imageUrl) {}
}
