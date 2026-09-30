package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.events.UserSuspendedEvent;
import com.orenjitrade.api.users.events.UserUnsuspendedEvent;
import java.util.UUID;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * Takes suspended collectors off the map and puts them back when the suspension ends. Both handlers
 * converge to the state implied by the account's current status (and the privacy settings), so
 * republished or reordered events are harmless.
 */
@Component
public class AccountStateLocationListener {

    private final LocationService locationService;
    private final UserAccountService userAccountService;
    private final TimeProvider timeProvider;

    public AccountStateLocationListener(
            LocationService locationService,
            UserAccountService userAccountService,
            TimeProvider timeProvider) {
        this.locationService = locationService;
        this.userAccountService = userAccountService;
        this.timeProvider = timeProvider;
    }

    @ApplicationModuleListener
    void on(UserSuspendedEvent event) {
        reconcile(event.userId());
    }

    @ApplicationModuleListener
    void on(UserUnsuspendedEvent event) {
        reconcile(event.userId());
    }

    private void reconcile(UUID userId) {
        boolean active =
                userAccountService
                        .findSnapshot(userId)
                        .map(
                                account ->
                                        account.status() == AccountStatus.ACTIVE
                                                && !account.isSuspendedAt(timeProvider.now()))
                        .orElse(false);
        if (active) {
            locationService.refreshPublicPoint(userId);
        } else {
            locationService.hidePublicPoint(userId);
        }
    }
}
