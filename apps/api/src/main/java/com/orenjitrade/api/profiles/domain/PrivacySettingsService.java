package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.DiscoverabilityPolicy;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.events.LocationRemovedEvent;
import com.orenjitrade.api.profiles.events.PrivacySettingsChangedEvent;
import com.orenjitrade.api.profiles.infra.PrivacySettingsRepository;
import com.orenjitrade.api.users.domain.ConsentService;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Privacy settings ({@code GET|PUT /api/v1/me/settings/privacy}). Also the location module's {@link
 * DiscoverabilityPolicy}. Every save publishes {@link PrivacySettingsChangedEvent} (the inventory
 * re-evaluates the collector's public listings; discovery caches expire).
 *
 * <p>Becoming (or staying) discoverable needs the 18+ confirmation ({@code 403
 * AGE_CONFIRMATION_REQUIRED} otherwise) and a location with a country and a state/province ({@code
 * 409 LOCATION_REQUIRED}, ADR 0017); removing the location turns discoverability off. {@code
 * searchDiscoverable} (on by default, name search only) is deliberately not gated.
 */
@Service
public class PrivacySettingsService implements DiscoverabilityPolicy {

    private final PrivacySettingsRepository repository;
    private final LocationService locationService;
    private final ConsentService consents;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public PrivacySettingsService(
            PrivacySettingsRepository repository,
            LocationService locationService,
            ConsentService consents,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.locationService = locationService;
        this.consents = consents;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public PrivacySettingsView settingsOf(UUID userId) {
        return repository
                .findById(userId)
                .map(PrivacySettings::toView)
                .orElse(PrivacySettingsView.DEFAULTS);
    }

    @Transactional
    public PrivacySettingsView update(UUID userId, PrivacySettingsView requested) {
        if (requested.discoverable()) {
            consents.requireAgeConfirmed(userId);
            if (!locationService.hasLocation(userId)) {
                throw new ApiException(
                        ErrorCode.LOCATION_REQUIRED,
                        "Choose your country and state or province before becoming"
                                + " discoverable");
            }
        }
        PrivacySettings settings =
                repository
                        .findById(userId)
                        .orElseGet(
                                () ->
                                        repository.save(
                                                new PrivacySettings(userId, timeProvider.now())));
        settings.apply(requested, timeProvider.now());
        repository.flush();
        events.publishEvent(new PrivacySettingsChangedEvent(userId, timeProvider.now()));
        return settings.toView();
    }

    /** No location, no discoverability: turned off in the transaction that removed the location. */
    @EventListener
    @Transactional
    void on(LocationRemovedEvent event) {
        repository
                .findById(event.userId())
                .filter(settings -> settings.toView().discoverable())
                .ifPresent(
                        settings -> {
                            PrivacySettingsView current = settings.toView();
                            settings.apply(
                                    new PrivacySettingsView(
                                            false,
                                            current.showOnlineStatus(),
                                            current.showLastActive(),
                                            current.profileVisibility(),
                                            current.messagingPermission(),
                                            current.wishlistVisible(),
                                            current.searchDiscoverable()),
                                    timeProvider.now());
                            repository.flush();
                            events.publishEvent(
                                    new PrivacySettingsChangedEvent(
                                            event.userId(), timeProvider.now()));
                        });
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isDiscoverable(UUID userId) {
        return settingsOf(userId).discoverable();
    }

    /** Deletes the row (account deletion). */
    @Transactional
    public void purge(UUID userId) {
        repository.deleteById(userId);
    }
}
