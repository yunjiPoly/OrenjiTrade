package com.orenjitrade.api.location.domain;

import com.orenjitrade.api.audit.domain.ActorType;
import com.orenjitrade.api.audit.domain.AuditService;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.cache.RedisJsonCache;
import com.orenjitrade.api.location.events.RegionsChangedEvent;
import com.orenjitrade.api.location.infra.RegionRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The platform regions, their countries and subdivisions (ADR 0017): data, not code (ADR 0014).
 * Read through a Redis cache ({@link #CACHE_TTL}) with a short in-process memo, evicted after every
 * admin write. Region codes received from clients are validated here ({@code 400
 * VALIDATION_FAILED}); a region only scopes results and never grants access to anything.
 */
@Service
public class RegionCatalog {

    public static final Duration CACHE_TTL = Duration.ofSeconds(60);
    public static final String ACTION_UPDATE_COUNTRY = "region.country.update";
    public static final String TARGET_COUNTRY = "COUNTRY";

    static final String CACHE_KEY = "regions:v1";
    static final Duration MEMO_TTL = Duration.ofSeconds(10);

    private final RegionRepository repository;
    private final RedisJsonCache cache;
    private final AuditService auditService;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    private volatile @Nullable Indexed memo;

    public RegionCatalog(
            RegionRepository repository,
            RedisJsonCache cache,
            AuditService auditService,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.cache = cache;
        this.auditService = auditService;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    // ---------------------------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------------------------

    /** Every region with its countries (inactive included) and subdivisions, in display order. */
    public List<RegionView> regions() {
        return indexed().snapshot().regions();
    }

    public Optional<RegionView> region(String code) {
        return Optional.ofNullable(indexed().regions().get(code));
    }

    /** The default region ({@code americas-north} as seeded). */
    public RegionView defaultRegion() {
        Indexed index = indexed();
        return index.snapshot().regions().stream()
                .filter(RegionView::isDefault)
                .findFirst()
                .orElseGet(() -> index.snapshot().regions().getFirst());
    }

    public Optional<CountryView> country(String code) {
        return Optional.ofNullable(indexed().countries().get(code));
    }

    /** The subdivision {@code code} of {@code countryCode}, if it belongs to that country. */
    public Optional<SubdivisionView> subdivision(String countryCode, String code) {
        @Nullable CountryView country = indexed().countries().get(countryCode);
        if (country == null) {
            return Optional.empty();
        }
        return country.subdivisions().stream()
                .filter(subdivision -> subdivision.code().equals(code))
                .findFirst();
    }

    /** The country owning the subdivision {@code code}. */
    public Optional<CountryView> countryOfSubdivision(String code) {
        @Nullable String countryCode = indexed().subdivisionCountry().get(code);
        return countryCode == null ? Optional.empty() : country(countryCode);
    }

    /**
     * The validated region {@code code} as sent by a client ({@code region} parameter), or {@code
     * 400 VALIDATION_FAILED} on {@code field} when unknown.
     */
    public RegionView requireRegion(String code, String field) {
        String normalised = code.trim().toLowerCase(Locale.ROOT);
        return region(normalised)
                .orElseThrow(
                        () ->
                                ApiException.validation(
                                        "Validation failed",
                                        List.of(
                                                new ProblemFieldError(
                                                        field,
                                                        "unknown region; expected one of "
                                                                + String.join(
                                                                        ", ",
                                                                        indexed()
                                                                                .regions()
                                                                                .keySet())))));
    }

    /**
     * The scoping region of a request: the {@code requested} code when given (validated, {@code
     * 400} when unknown), else {@code fallback} (e.g. the caller's home region), else the default.
     */
    public RegionView resolve(@Nullable String requested, @Nullable String fallback) {
        if (requested != null && !requested.isBlank()) {
            return requireRegion(requested, "region");
        }
        if (fallback != null) {
            Optional<RegionView> home = region(fallback);
            if (home.isPresent()) {
                return home.get();
            }
        }
        return defaultRegion();
    }

    // ---------------------------------------------------------------------------------------
    // Administration (ADMIN, SUPER_ADMIN; audited)
    // ---------------------------------------------------------------------------------------

    /**
     * Moves a country to another region and/or (de)activates it. Audited ({@value
     * #ACTION_UPDATE_COUNTRY}); the cache is evicted after commit.
     */
    @Transactional
    public CountryView updateCountry(
            AuthenticatedUser actor, String code, String regionCode, boolean active) {
        String countryCode = code.trim().toUpperCase(Locale.ROOT);
        CountryView current =
                country(countryCode).orElseThrow(() -> ApiException.notFound("Country not found"));
        RegionView target = requireRegion(regionCode, "regionCode");
        Instant now = timeProvider.now();
        if (!repository.updateCountry(countryCode, target.code(), active, actor.userId(), now)) {
            throw ApiException.notFound("Country not found");
        }
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("country", countryCode);
        details.put("previousRegion", current.regionCode());
        details.put("region", target.code());
        details.put("previousActive", current.active());
        details.put("active", active);
        auditService.record(
                ActorType.ADMIN,
                actor.userId(),
                ACTION_UPDATE_COUNTRY,
                TARGET_COUNTRY,
                countryCode,
                details);
        evictAfterCommit();
        events.publishEvent(new RegionsChangedEvent(countryCode, now));
        return new CountryView(
                countryCode,
                current.name(),
                target.code(),
                active,
                current.sortOrder(),
                current.subdivisions());
    }

    /** Drops the cached lists (admin writes, tests). */
    public void invalidate() {
        memo = null;
        cache.evict(CACHE_KEY);
    }

    // ---------------------------------------------------------------------------------------
    // Cache
    // ---------------------------------------------------------------------------------------

    private Indexed indexed() {
        @Nullable Indexed current = memo;
        Instant now = Instant.now();
        if (current != null && current.loadedAt().plus(MEMO_TTL).isAfter(now)) {
            return current;
        }
        RegionSnapshot snapshot =
                cache.get(
                        CACHE_KEY,
                        RegionSnapshot.class,
                        CACHE_TTL,
                        () -> new RegionSnapshot(repository.findAll()));
        Indexed next = Indexed.of(snapshot, now);
        memo = next;
        return next;
    }

    private void evictAfterCommit() {
        invalidate();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            invalidate();
                        }
                    });
        }
    }

    /** Cached form of the lists (a record so the JSON cache can read it back). */
    public record RegionSnapshot(List<RegionView> regions) {}

    private record Indexed(
            RegionSnapshot snapshot,
            Map<String, RegionView> regions,
            Map<String, CountryView> countries,
            Map<String, String> subdivisionCountry,
            Instant loadedAt) {

        static Indexed of(RegionSnapshot snapshot, Instant loadedAt) {
            Map<String, RegionView> regions = new LinkedHashMap<>();
            Map<String, CountryView> countries = new HashMap<>();
            Map<String, String> subdivisionCountry = new HashMap<>();
            for (RegionView region : snapshot.regions()) {
                regions.put(region.code(), region);
                for (CountryView country : region.countries()) {
                    countries.put(country.code(), country);
                    for (SubdivisionView subdivision : country.subdivisions()) {
                        subdivisionCountry.put(subdivision.code(), country.code());
                    }
                }
            }
            return new Indexed(snapshot, regions, countries, subdivisionCountry, loadedAt);
        }
    }
}
