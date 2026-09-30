package com.orenjitrade.api.wishlist.events;

import java.time.Instant;
import java.util.UUID;

/**
 * A public inventory item matched a wishlist item (analytics {@code wishlist_matched}). Geography
 * is the distance bucket only (ADR 0004).
 *
 * @param matchId the match
 * @param wishlistItemId wishlist item
 * @param wisherId owner of the wishlist item
 * @param inventoryItemId the matching item
 * @param itemOwnerId owner of the item
 * @param game game slug
 * @param distanceBucket bucketed distance between the two public points
 * @param notified whether a notification was created
 * @param matchedAt when
 */
public record WishlistMatched(
        UUID matchId,
        UUID wishlistItemId,
        UUID wisherId,
        UUID inventoryItemId,
        UUID itemOwnerId,
        String game,
        String distanceBucket,
        boolean notified,
        Instant matchedAt) {}
