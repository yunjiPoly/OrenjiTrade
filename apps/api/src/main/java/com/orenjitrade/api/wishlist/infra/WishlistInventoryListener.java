package com.orenjitrade.api.wishlist.infra;

import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.wishlist.domain.WishlistAlerts;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * {@code InventoryItemPublished} → {@link WishlistAlerts} (stage S2, ADR 0009): after commit, in
 * its own transaction, from the Spring Modulith event registry (republished after a crash).
 * Idempotent: the sent-alert key ({@code wishlist_alert_sent}) and the notification dedup key make
 * a redelivered or repeated publication alert nobody twice.
 */
@Component
public class WishlistInventoryListener {

    private final WishlistAlerts alerts;

    public WishlistInventoryListener(WishlistAlerts alerts) {
        this.alerts = alerts;
    }

    @ApplicationModuleListener
    void on(InventoryItemPublished event) {
        alerts.alertForPublishedItem(event.itemId());
    }
}
