package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds the self-declared locations of the 12 fictional accounts ({@code db/seed/locations.json}:
 * countries, states/provinces and city names spread over the three platform regions, ADR 0017). An
 * account that already has a location keeps it (a developer may have changed it). An account that
 * gets its seed location now also gets its seeded discoverability back ({@code
 * db/seed/profiles.json}): V108 turned discoverability off when it dropped the coordinate model.
 * Runs after the profiles seed, which creates the privacy settings.
 */
@Component
public class LocationSeedContributor implements SeedContributor {

    static final String RESOURCE = "db/seed/locations.json";
    static final String PROFILES = "db/seed/profiles.json";
    static final String SEED_ID_PREFIX = "00000000-0000-4000-8000-0000000000";

    private final LocationService locationService;
    private final UserAccountService userAccountService;
    private final JdbcClient jdbc;
    private final List<SeedLocation> locations;
    private final List<SeedDiscoverability> discoverability;

    public LocationSeedContributor(
            LocationService locationService,
            UserAccountService userAccountService,
            JdbcClient jdbc,
            JsonMapper jsonMapper) {
        this.locationService = locationService;
        this.userAccountService = userAccountService;
        this.jdbc = jdbc;
        this.locations = read(jsonMapper, RESOURCE, new TypeReference<List<SeedLocation>>() {});
        this.discoverability =
                read(jsonMapper, PROFILES, new TypeReference<List<SeedDiscoverability>>() {});
    }

    @Override
    public String name() {
        return "locations";
    }

    @Override
    public int order() {
        return ORDER_LOCATIONS;
    }

    @Override
    @Transactional
    public void seed() {
        for (SeedLocation location : locations) {
            UUID userId = UUID.fromString(SEED_ID_PREFIX + location.nn());
            boolean usable =
                    userAccountService
                            .findSnapshot(userId)
                            .map(account -> account.status() == AccountStatus.ACTIVE)
                            .orElse(false);
            if (!usable || locationService.hasLocation(userId)) {
                continue;
            }
            locationService.setMine(
                    userId,
                    location.countryCode(),
                    location.subdivisionCode(),
                    location.city(),
                    location.showCity());
            boolean seededDiscoverable =
                    discoverability.stream()
                            .anyMatch(
                                    entry ->
                                            entry.nn().equals(location.nn())
                                                    && entry.discoverable());
            if (seededDiscoverable) {
                // Seed data only (profiles' own seed writes privacy_settings the same way).
                jdbc.sql(
                                "UPDATE privacy_settings SET discoverable = true, updated_at ="
                                        + " now() WHERE user_id = :id AND NOT discoverable")
                        .param("id", userId)
                        .update();
            }
        }
    }

    private static <T> T read(JsonMapper jsonMapper, String resource, TypeReference<T> type) {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            return jsonMapper.readValue(in, type);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + resource, e);
        }
    }

    /** JSON shape of {@value #RESOURCE}. */
    record SeedLocation(
            String nn,
            String countryCode,
            String subdivisionCode,
            @Nullable String city,
            boolean showCity) {}

    /** The part of {@value #PROFILES} this seed reads. */
    record SeedDiscoverability(String nn, boolean discoverable) {}
}
