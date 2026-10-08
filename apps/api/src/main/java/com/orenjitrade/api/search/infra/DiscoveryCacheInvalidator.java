package com.orenjitrade.api.search.infra;

import com.orenjitrade.api.binders.events.BinderFreshnessChanged;
import com.orenjitrade.api.binders.events.BinderPublished;
import com.orenjitrade.api.binders.events.BinderUnpublished;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.inventory.events.InventoryItemUnpublished;
import com.orenjitrade.api.location.events.LocationChangedEvent;
import com.orenjitrade.api.location.events.LocationRemovedEvent;
import com.orenjitrade.api.location.events.RegionsChangedEvent;
import com.orenjitrade.api.profiles.events.PrivacySettingsChangedEvent;
import com.orenjitrade.api.users.events.AccountDeletedEvent;
import com.orenjitrade.api.users.events.AccountDeletionCancelledEvent;
import com.orenjitrade.api.users.events.AccountDeletionRequestedEvent;
import com.orenjitrade.api.users.events.UserSuspendedEvent;
import com.orenjitrade.api.users.events.UserUnsuspendedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Invalidates the discovery cache when what discovery shows changes: an item or binder is published
 * or unpublished (the inventory module emits these once per effective-visibility flip, including
 * suspensions, deletions and freshness hiding), a binder's freshness changes, a location is set,
 * changed or removed, an admin moves a country to another region, privacy settings are saved, an
 * account is suspended or reinstated, or its deletion is requested, cancelled or carried out. Plain
 * listeners that defer the invalidation until the surrounding transaction commits (so a concurrent
 * request cannot re-cache the old state); they are not stored in the event publication registry.
 * Idempotent: an extra invalidation only costs a cache miss.
 */
@Component
public class DiscoveryCacheInvalidator {

    private final DiscoveryCache cache;

    public DiscoveryCacheInvalidator(DiscoveryCache cache) {
        this.cache = cache;
    }

    @EventListener
    void on(InventoryItemPublished event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(InventoryItemUnpublished event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(BinderPublished event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(BinderUnpublished event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(BinderFreshnessChanged event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(LocationChangedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(RegionsChangedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(LocationRemovedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(PrivacySettingsChangedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(UserSuspendedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(UserUnsuspendedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(AccountDeletionRequestedEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(AccountDeletionCancelledEvent event) {
        invalidateAfterCommit();
    }

    @EventListener
    void on(AccountDeletedEvent event) {
        invalidateAfterCommit();
    }

    private void invalidateAfterCommit() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            cache.invalidate();
                        }
                    });
        } else {
            cache.invalidate();
        }
    }
}
