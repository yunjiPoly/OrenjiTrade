package com.orenjitrade.api.location.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.events.LocationChangedEvent;
import com.orenjitrade.api.location.events.LocationRemovedEvent;
import com.orenjitrade.api.location.infra.UserLocationRepository;
import com.orenjitrade.api.moderation.domain.ModerationScope;
import com.orenjitrade.api.moderation.domain.ModerationVerdict;
import com.orenjitrade.api.moderation.domain.TextModerationService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The location module's service interface (ADR 0017). A collector declares a country, a
 * state/province (validated against the seeded lists, {@code 400 VALIDATION_FAILED} for unknown
 * codes) and an optional city (trimmed, at most {@value #CITY_MAX} characters, moderated like
 * profile text, never geocoded). Other modules only get {@link PublicPlace}s (state/province +
 * country); the city leaves this class only through {@link #getMine} (the owner), {@link
 * #profileCityOf} (the owner's public profile, when shown) and the owner's export. The city is
 * never logged and never put into an event.
 */
@Service
public class LocationService {

    public static final int CITY_MAX = 80;

    private static final Logger log = LoggerFactory.getLogger(LocationService.class);

    /** Letters, marks, digits, spaces and the punctuation of place names ("St. John's"). */
    static final Pattern CITY_CHARACTERS = Pattern.compile("^[\\p{L}\\p{M}\\p{N} .,'’()&-]+$");

    /** Something that looks like a coordinate pair or a decimal degree (never a city). */
    static final Pattern COORDINATE_LIKE = Pattern.compile("\\d{1,3}[.,]\\d{2,}");

    private final UserLocationRepository repository;
    private final RegionCatalog regions;
    private final TextModerationService moderation;
    private final ObjectProvider<DiscoverabilityPolicy> discoverabilityPolicy;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public LocationService(
            UserLocationRepository repository,
            RegionCatalog regions,
            TextModerationService moderation,
            ObjectProvider<DiscoverabilityPolicy> discoverabilityPolicy,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.regions = regions;
        this.moderation = moderation;
        this.discoverabilityPolicy = discoverabilityPolicy;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    // ---------------------------------------------------------------------------------------
    // Owner
    // ---------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MyLocationView getMine(UUID userId) {
        boolean discoverable = isDiscoverable(userId);
        return repository
                .find(userId)
                .map(
                        stored ->
                                new MyLocationView(
                                        stored.place(),
                                        regionName(stored.place().regionCode()),
                                        stored.city(),
                                        stored.showCity(),
                                        discoverable))
                .orElseGet(() -> new MyLocationView(null, null, null, true, discoverable));
    }

    /**
     * Sets the owner's location. {@code countryCode} must be an active country, {@code
     * subdivisionCode} one of its subdivisions; {@code city} is optional ({@code null} or blank
     * clears it); {@code showCity} defaults to true.
     */
    @Transactional
    public MyLocationView setMine(
            UUID userId,
            @Nullable String countryCode,
            @Nullable String subdivisionCode,
            @Nullable String city,
            @Nullable Boolean showCity) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable CountryView country = null;
        String countryValue = upper(countryCode);
        if (countryValue.isEmpty()) {
            errors.add(new ProblemFieldError("countryCode", "must not be blank"));
        } else {
            country = regions.country(countryValue).filter(CountryView::active).orElse(null);
            if (country == null) {
                errors.add(new ProblemFieldError("countryCode", "unknown country"));
            }
        }
        String subdivisionValue = upper(subdivisionCode);
        if (subdivisionValue.isEmpty()) {
            errors.add(new ProblemFieldError("subdivisionCode", "must not be blank"));
        } else if (country != null
                && regions.subdivision(country.code(), subdivisionValue).isEmpty()) {
            errors.add(
                    new ProblemFieldError(
                            "subdivisionCode", "unknown state or province for this country"));
        }
        @Nullable String cleanCity = normaliseCity(city, errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        Instant now = timeProvider.now();
        repository.upsert(
                userId,
                country.code(),
                subdivisionValue,
                cleanCity,
                showCity == null || showCity,
                now);
        events.publishEvent(
                new LocationChangedEvent(
                        userId, country.regionCode(), country.code(), subdivisionValue, now));
        return getMine(userId);
    }

    /** Removes the owner's location: they are no longer discoverable. */
    @Transactional
    public void deleteMine(UUID userId) {
        if (repository.delete(userId) > 0) {
            events.publishEvent(new LocationRemovedEvent(userId, timeProvider.now()));
        }
    }

    // ---------------------------------------------------------------------------------------
    // Reads for other modules (never the city, except the owner's own profile)
    // ---------------------------------------------------------------------------------------

    /** State/province + country of the collector, when set. */
    @Transactional(readOnly = true)
    public Optional<PublicPlace> publicPlaceOf(UUID userId) {
        return repository.find(userId).map(StoredLocation::place);
    }

    /** Places of the given collectors (one query); collectors without a location are absent. */
    @Transactional(readOnly = true)
    public Map<UUID, PublicPlace> publicPlacesOf(Collection<UUID> userIds) {
        Map<UUID, PublicPlace> places = new LinkedHashMap<>();
        repository.findAll(userIds).forEach((id, stored) -> places.put(id, stored.place()));
        return places;
    }

    /**
     * The city the collector shows on their own public profile: empty without a city or while "Show
     * my city on my profile" is off. Only the profile module's collector profile uses it.
     */
    @Transactional(readOnly = true)
    public Optional<String> profileCityOf(UUID userId) {
        return repository
                .find(userId)
                .filter(StoredLocation::showCity)
                .map(StoredLocation::city)
                .filter(city -> !city.isBlank());
    }

    /** The platform region of the collector's country, when a location is set. */
    @Transactional(readOnly = true)
    public Optional<String> homeRegionOf(UUID userId) {
        return publicPlaceOf(userId).map(PublicPlace::regionCode);
    }

    /** "State, Country" of the collector (admin views); never the city. */
    @Transactional(readOnly = true)
    public Optional<String> labelOf(UUID userId) {
        return publicPlaceOf(userId).map(PublicPlace::label);
    }

    /** Whether the collector set a country and a subdivision (required to be discoverable). */
    @Transactional(readOnly = true)
    public boolean hasLocation(UUID userId) {
        return repository.exists(userId);
    }

    /** Deletes the row for good (account deletion job). */
    @Transactional
    public void purge(UUID userId) {
        deleteMine(userId);
    }

    // ---------------------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------------------

    /**
     * The trimmed city ({@code null} for none), or a field error: at most {@value #CITY_MAX}
     * characters, letters, digits and the punctuation of place names only, nothing that looks like
     * a coordinate, and nothing the moderation rules block. Flagged text is accepted and logged
     * without the text.
     */
    @Nullable String normaliseCity(@Nullable String city, List<ProblemFieldError> errors) {
        if (city == null) {
            return null;
        }
        String trimmed = city.strip().replaceAll("\\s+", " ");
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.codePointCount(0, trimmed.length()) > CITY_MAX) {
            errors.add(
                    new ProblemFieldError("city", "must be at most " + CITY_MAX + " characters"));
            return null;
        }
        if (!CITY_CHARACTERS.matcher(trimmed).matches()
                || COORDINATE_LIKE.matcher(trimmed).find()) {
            errors.add(
                    new ProblemFieldError(
                            "city", "may only contain letters, digits, spaces and . , ' ( ) & -"));
            return null;
        }
        ModerationVerdict verdict = moderation.evaluate(ModerationScope.PROFILE, trimmed);
        if (verdict.isBlocked()) {
            errors.add(new ProblemFieldError("city", "contains a term that is not allowed"));
            return null;
        }
        if (verdict == ModerationVerdict.FLAG) {
            log.info("Location city flagged for review");
        }
        return trimmed;
    }

    private @Nullable String regionName(String code) {
        return regions.region(code).map(RegionView::name).orElse(null);
    }

    private static String upper(@Nullable String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private boolean isDiscoverable(UUID userId) {
        @Nullable DiscoverabilityPolicy policy = discoverabilityPolicy.getIfAvailable();
        return policy != null && policy.isDiscoverable(userId);
    }
}
