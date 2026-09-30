package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.inventory.domain.ListingReconciler;
import com.orenjitrade.api.profiles.events.PrivacySettingsChangedEvent;
import com.orenjitrade.api.users.events.UserSuspendedEvent;
import com.orenjitrade.api.users.events.UserUnsuspendedEvent;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Re-evaluates a collector's public listings when their account state or privacy settings change
 * (suspension hides them, unsuspension and discoverability bring them back). Public reads already
 * apply the live rules; this only keeps the materialised flags and the publication events in line.
 * Idempotent: a republished event converges to the same state.
 */
@Component
public class AccountStateInventoryListener {

    private final ListingReconciler reconciler;

    public AccountStateInventoryListener(ListingReconciler reconciler) {
        this.reconciler = reconciler;
    }

    @ApplicationModuleListener
    void on(UserSuspendedEvent event) {
        reconciler.owner(event.userId());
    }

    @ApplicationModuleListener
    void on(UserUnsuspendedEvent event) {
        reconciler.owner(event.userId());
    }

    @ApplicationModuleListener
    void on(PrivacySettingsChangedEvent event) {
        reconciler.owner(event.userId());
    }
}
