package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.wishlist.domain.WishlistMatcher;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * {@code InventoryItemPublished} → {@link WishlistMatcher} (Phase 6 contract, ADR 0009): after
 * commit, in its own transaction, from the Spring Modulith event registry (republished after a
 * crash). Idempotent: matches and notifications are keyed by the pair.
 */
@Component
public class WishlistInventoryListener {

    private final WishlistMatcher matcher;

    public WishlistInventoryListener(WishlistMatcher matcher) {
        this.matcher = matcher;
    }

    @ApplicationModuleListener
    void on(InventoryItemPublished event) {
        matcher.matchPublishedItem(event.itemId());
    }
}
