package com.orenjitrade.api.location.domain;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.events.LocationRemovedEvent;
import com.orenjitrade.api.location.events.TradingAreaChangedEvent;
import com.orenjitrade.api.location.infra.UserLocationRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The location module's service interface (ADR 0004). The trading-area centre never leaves this
 * class except through {@link #getMine} (the owner's own view) and the owner's export; everything
 * other modules get is a {@link PublicLocation}, a region label or a {@link DistanceBucket}.
 * Coordinates are never logged.
 */
@Service
public class LocationService {

    private final UserLocationRepository repository;
    private final ApproximateLocationService approximateLocationService;
    private final ObjectProvider<DiscoverabilityPolicy> discoverabilityPolicy;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public LocationService(
            UserLocationRepository repository,
            ApproximateLocationService approximateLocationService,
            ObjectProvider<DiscoverabilityPolicy> discoverabilityPolicy,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.approximateLocationService = approximateLocationService;
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
                                        new MyLocationView.TradingArea(
                                                stored.centreLat(),
                                                stored.centreLng(),
                                                stored.radiusKm(),
                                                stored.source(),
                                                stored.publicLabel()),
                                        stored.publicPoint(),
                                        discoverable))
                .orElseGet(() -> new MyLocationView(null, null, discoverable));
    }

    /**
     * Sets the owner's trading area. The centre is stored rounded to 3 decimals; the public point
     * and label are re-derived (the point is stored only while the collector is discoverable).
     */
    @Transactional
    public MyLocationView setTradingArea(
            UUID userId, double lat, double lng, int radiusKm, TradingAreaSource source) {
        double centreLat = GeoMath.round3(lat);
        double centreLng = GeoMath.round3(GeoMath.normaliseLng(lng));
        DerivedLocation derived = approximateLocationService.derive(userId, centreLat, centreLng);
        boolean visible = isDiscoverable(userId);
        Instant now = timeProvider.now();
        repository.upsert(
                userId,
                centreLat,
                centreLng,
                radiusKm * 1000,
                source,
                visible ? derived.publicPoint() : null,
                derived.label(),
                visible ? derived.cell().id() : null,
                now);
        events.publishEvent(
                new TradingAreaChangedEvent(userId, visible ? derived.cell().id() : null, now));
        return getMine(userId);
    }

    /** Removes every location row of the owner: they disappear from the map. */
    @Transactional
    public void deleteMine(UUID userId) {
        if (repository.delete(userId) > 0) {
            events.publishEvent(new LocationRemovedEvent(userId, timeProvider.now()));
        }
    }

    // ---------------------------------------------------------------------------------------
    // Visibility (privacy settings, account state)
    // ---------------------------------------------------------------------------------------

    /**
     * Re-derives (discoverable) or clears (not discoverable) the stored public point, e.g. after
     * the privacy settings changed or a deletion was cancelled. No-op without a trading area.
     */
    @Transactional
    public void refreshPublicPoint(UUID userId) {
        Optional<StoredLocation> stored = repository.find(userId);
        if (stored.isEmpty()) {
            return;
        }
        if (isDiscoverable(userId)) {
            DerivedLocation derived =
                    approximateLocationService.derive(
                            userId, stored.get().centreLat(), stored.get().centreLng());
            publish(userId, derived.publicPoint(), derived.cell().id(), stored.get());
        } else {
            publish(userId, null, null, stored.get());
        }
    }

    /** Takes the collector off the map without touching the trading area (deletion, suspension). */
    @Transactional
    public void hidePublicPoint(UUID userId) {
        repository.find(userId).ifPresent(stored -> publish(userId, null, null, stored));
    }

    private void publish(
            UUID userId,
            @Nullable PublicPoint point,
            @Nullable String gridCell,
            StoredLocation current) {
        if (java.util.Objects.equals(point, current.publicPoint())
                && java.util.Objects.equals(gridCell, current.gridCell())) {
            return;
        }
        Instant now = timeProvider.now();
        repository.updatePublicPoint(userId, point, gridCell, now);
        events.publishEvent(new TradingAreaChangedEvent(userId, gridCell, now));
    }

    // ---------------------------------------------------------------------------------------
    // Public reads for other modules
    // ---------------------------------------------------------------------------------------

    /** The collector's public location while they are on the map, otherwise empty. */
    @Transactional(readOnly = true)
    public Optional<PublicLocation> publicLocationOf(UUID userId) {
        return repository
                .find(userId)
                .filter(stored -> stored.publicPoint() != null && stored.gridCell() != null)
                .map(
                        stored ->
                                new PublicLocation(
                                        stored.publicPoint(),
                                        stored.publicLabel() != null ? stored.publicLabel() : "",
                                        stored.gridCell()));
    }

    /**
     * Bucketed distance from the requester's own trading-area centre (private to them, never
     * exposed) to a public point. Empty when the requester has no trading area.
     */
    @Transactional(readOnly = true)
    public Optional<DistanceBucket> distanceFrom(UUID requesterId, PublicPoint target) {
        return repository
                .find(requesterId)
                .map(
                        requester ->
                                DistanceBucket.ofKm(
                                        GeoMath.distanceKm(
                                                requester.centreLat(),
                                                requester.centreLng(),
                                                target.lat(),
                                                target.lng())));
    }

    /**
     * The requester's own trading-area centre as a default search centre (Phase 4 map and search),
     * already snapped to {@link SearchCentre#STEP_DEG} degrees: the precise centre never leaves
     * this module. Empty when the requester has no trading area.
     */
    @Transactional(readOnly = true)
    public Optional<SearchCentre> searchCentreOf(UUID requesterId) {
        return repository
                .find(requesterId)
                .map(stored -> SearchCentre.snap(stored.centreLat(), stored.centreLng()));
    }

    /** Region label of the collector's trading area (admin views); never a coordinate. */
    @Transactional(readOnly = true)
    public Optional<String> labelOf(UUID userId) {
        return repository.find(userId).map(StoredLocation::publicLabel);
    }

    @Transactional(readOnly = true)
    public boolean hasTradingArea(UUID userId) {
        return repository.exists(userId);
    }

    /** Deletes the rows for good (account deletion job). */
    @Transactional
    public void purge(UUID userId) {
        deleteMine(userId);
    }

    private boolean isDiscoverable(UUID userId) {
        @Nullable DiscoverabilityPolicy policy = discoverabilityPolicy.getIfAvailable();
        return policy != null && policy.isDiscoverable(userId);
    }
}
