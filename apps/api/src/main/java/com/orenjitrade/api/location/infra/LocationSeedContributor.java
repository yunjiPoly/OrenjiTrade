package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.TradingAreaSource;
import com.orenjitrade.api.users.domain.UserAccountService;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Seeds the trading areas of the 12 fictional accounts ({@code db/seed/locations.json}: public
 * neighbourhood centroids from {@code docs/development/seed-data.md}, never residential addresses).
 * Existing trading areas are kept (a developer may have moved them); their public point is only
 * re-derived so it matches the seeded privacy settings. Runs after the profiles seed, which creates
 * the privacy settings that decide whether a public point exists.
 */
@Component
public class LocationSeedContributor implements SeedContributor {

    static final String RESOURCE = "db/seed/locations.json";
    static final String SEED_ID_PREFIX = "00000000-0000-4000-8000-0000000000";

    private final LocationService locationService;
    private final UserAccountService userAccountService;
    private final List<SeedLocation> locations;

    public LocationSeedContributor(
            LocationService locationService,
            UserAccountService userAccountService,
            JsonMapper jsonMapper) {
        this.locationService = locationService;
        this.userAccountService = userAccountService;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            this.locations = jsonMapper.readValue(in, new TypeReference<List<SeedLocation>>() {});
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + RESOURCE, e);
        }
    }

    @Override
    public String name() {
        return "trading areas";
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
            if (!usable) {
                continue;
            }
            if (locationService.hasTradingArea(userId)) {
                locationService.refreshPublicPoint(userId);
            } else {
                locationService.setTradingArea(
                        userId,
                        location.lat(),
                        location.lng(),
                        location.radiusKm(),
                        TradingAreaSource.MANUAL);
            }
        }
    }

    /** JSON shape of {@value #RESOURCE}. */
    record SeedLocation(String nn, double lat, double lng, int radiusKm) {}
}
