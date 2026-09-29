package com.orenjitrade.api.profiles.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.DiscoverabilityPolicy;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.profiles.infra.PrivacySettingsRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Privacy settings ({@code GET|PUT /api/v1/me/settings/privacy}). Also the location module's {@link
 * DiscoverabilityPolicy}: turning {@code discoverable} on or off immediately derives or clears the
 * stored public point (ADR 0004), in the same transaction.
 */
@Service
public class PrivacySettingsService implements DiscoverabilityPolicy {

    private final PrivacySettingsRepository repository;
    private final LocationService locationService;
    private final TimeProvider timeProvider;

    public PrivacySettingsService(
            PrivacySettingsRepository repository,
            LocationService locationService,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.locationService = locationService;
        this.timeProvider = timeProvider;
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
        PrivacySettings settings =
                repository
                        .findById(userId)
                        .orElseGet(
                                () ->
                                        repository.save(
                                                new PrivacySettings(userId, timeProvider.now())));
        boolean wasDiscoverable = settings.toView().discoverable();
        settings.apply(requested, timeProvider.now());
        repository.flush();
        if (wasDiscoverable != requested.discoverable()) {
            locationService.refreshPublicPoint(userId);
        }
        return settings.toView();
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
