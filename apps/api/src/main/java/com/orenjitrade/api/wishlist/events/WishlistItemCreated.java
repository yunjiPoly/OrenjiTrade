package com.orenjitrade.api.wishlist.events;

import java.time.Instant;
import java.util.UUID;

/**
 * A collector added a card to their wishlist (analytics {@code wishlist_item_created}). Carries no
 * notes and no location.
 *
 * @param wishlistItemId the item
 * @param ownerId owner
 * @param game game slug
 * @param target {@code card} (any printing) or {@code printing}
 * @param hasMaxPrice whether a maximum price is set
 * @param tradePreference ANY, TRADE or SALE
 * @param occurredAt creation time
 */
public record WishlistItemCreated(
        UUID wishlistItemId,
        UUID ownerId,
        String game,
        String target,
        boolean hasMaxPrice,
        String tradePreference,
        Instant occurredAt) {}
