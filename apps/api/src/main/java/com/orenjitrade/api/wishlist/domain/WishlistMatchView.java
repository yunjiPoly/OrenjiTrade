package com.orenjitrade.api.wishlist.domain;

import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.search.domain.CollectorMarker;
import java.time.Instant;
import java.util.UUID;

/**
 * A match as the wishlist owner sees it: the public item (never private notes) and its owner's
 * marker (state/province and country only, ADR 0017).
 *
 * @param id match id
 * @param wishlistItemId wishlist item
 * @param item the public inventory item
 * @param collector the item owner's marker for the viewer
 * @param matchedAt when it matched
 * @param dismissed dismissed by the wishlist owner
 */
public record WishlistMatchView(
        UUID id,
        UUID wishlistItemId,
        InventoryItemView item,
        CollectorMarker collector,
        Instant matchedAt,
        boolean dismissed) {}
