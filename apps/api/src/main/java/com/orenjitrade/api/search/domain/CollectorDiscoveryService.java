package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.location.domain.RegionGeocoder;
import com.orenjitrade.api.location.domain.SearchCentre;
import com.orenjitrade.api.profiles.domain.PrivacyPolicyService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsService;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.search.domain.DiscoveryResults.CollectorPreview;
import com.orenjitrade.api.search.domain.DiscoveryResults.NearbyResult;
import com.orenjitrade.api.search.events.CollectorPreviewed;
import com.orenjitrade.api.search.events.SearchPerformed;
import com.orenjitrade.api.search.infra.CollectorSearchRepository;
import com.orenjitrade.api.search.infra.NearbyCache;
import com.orenjitrade.api.users.domain.UserAccountService;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Map discovery (Phase 4 contract "Collectors nearby"): {@code GET /collectors/nearby} and {@code
 * GET /collectors/{handle}/preview}, plus the collector engine of the unified search. Only
 * discoverable, ACTIVE collectors whose profile is not PRIVATE appear, at their derived public
 * point (ADR 0004); results are cached per request key for 60 s and made viewer-specific afterwards
 * ({@link MarkerAssembler}).
 */
@Service
public class CollectorDiscoveryService {

    static final String NOT_FOUND = "Collector not found";
    static final Pattern TAG_SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    static final int MAX_TAGS = 12;

    private final CollectorSearchRepository repository;
    private final NearbyCache cache;
    private final MarkerAssembler assembler;
    private final GeoScopeResolver geoScopes;
    private final GameService games;
    private final UserAccountService userAccountService;
    private final PrivacySettingsService privacySettingsService;
    private final PrivacyPolicyService privacyPolicy;
    private final ProfileService profileService;
    private final RegionGeocoder regionGeocoder;
    private final SearchProperties properties;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public CollectorDiscoveryService(
            CollectorSearchRepository repository,
            NearbyCache cache,
            MarkerAssembler assembler,
            GeoScopeResolver geoScopes,
            GameService games,
            UserAccountService userAccountService,
            PrivacySettingsService privacySettingsService,
            PrivacyPolicyService privacyPolicy,
            ProfileService profileService,
            RegionGeocoder regionGeocoder,
            SearchProperties properties,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.repository = repository;
        this.cache = cache;
        this.assembler = assembler;
        this.geoScopes = geoScopes;
        this.games = games;
        this.userAccountService = userAccountService;
        this.privacySettingsService = privacySettingsService;
        this.privacyPolicy = privacyPolicy;
        this.profileService = profileService;
        this.regionGeocoder = regionGeocoder;
        this.properties = properties;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    /**
     * A nearby request as received.
     *
     * @param lat centre latitude (required for signed-out callers)
     * @param lng centre longitude
     * @param radiusKm radius, capped by the plan
     * @param game game slug
     * @param availability availability filter
     * @param freshness ACTIVE or AGING
     * @param tags tag slugs
     * @param printingId holders of this printing
     * @param cardId holders of this card
     * @param query name, handle or tag text
     * @param limit maximum markers
     */
    public record NearbyRequest(
            @Nullable Double lat,
            @Nullable Double lng,
            @Nullable Double radiusKm,
            @Nullable String game,
            @Nullable SearchAvailability availability,
            @Nullable FreshnessState freshness,
            List<String> tags,
            @Nullable UUID printingId,
            @Nullable UUID cardId,
            @Nullable String query,
            int limit) {}

    /** {@code GET /collectors/nearby}. */
    @Transactional(readOnly = true)
    public NearbyResult nearby(@Nullable UUID viewerId, NearbyRequest request) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable String game = normaliseGame(request.game(), errors);
        List<String> tags = normaliseTags(request.tags(), errors);
        if (request.freshness() != null
                && request.freshness() != FreshnessState.ACTIVE
                && request.freshness() != FreshnessState.AGING) {
            errors.add(
                    new ProblemFieldError(
                            "freshness", "must be ACTIVE or AGING (stale listings never appear)"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        GeoScope scope =
                geoScopes.resolve(viewerId, request.lat(), request.lng(), request.radiusKm(), true);
        SearchCentre centre = Objects.requireNonNull(scope.centre());
        NearbyCriteria criteria =
                new NearbyCriteria(
                        centre,
                        scope.radiusKm(),
                        game,
                        request.availability(),
                        request.freshness(),
                        tags,
                        request.printingId(),
                        request.cardId(),
                        blankToNull(request.query()),
                        request.limit());
        Instant now = timeProvider.now();
        Found found = find(criteria, viewerId, now);
        if (criteria.query() != null
                || criteria.printingId() != null
                || criteria.cardId() != null) {
            events.publishEvent(
                    new SearchPerformed(
                            SearchPerformed.SURFACE_MAP,
                            viewerId,
                            criteria.query(),
                            game,
                            List.of(),
                            criteria.printingId() != null
                                    ? "printing"
                                    : criteria.cardId() != null ? "card" : "none",
                            found.total(),
                            scope.radiusKmRounded(),
                            criteria.filterNames(),
                            centre.gridCell(),
                            regionGeocoder.labelFor(centre.lat(), centre.lng()),
                            now));
        }
        return new NearbyResult(
                centre,
                scope.radiusKm(),
                found.markers(),
                found.total(),
                found.total() > found.markers().size());
    }

    /**
     * The collector engine (also used by the unified search): cached rows, matching items, then
     * viewer-specific markers (blocked collectors removed), at most {@code criteria.limit()}.
     */
    Found find(NearbyCriteria criteria, @Nullable UUID viewerId, Instant now) {
        NearbyPage page = cache.get(criteria, () -> load(criteria, now));
        List<CollectorMarker> markers = assembler.visibleMarkers(page.rows(), viewerId, now);
        long hidden = page.rows().size() - markers.size();
        long total = Math.max(0, page.total() - hidden);
        List<CollectorMarker> limited =
                markers.size() > criteria.limit() ? markers.subList(0, criteria.limit()) : markers;
        return new Found(List.copyOf(limited), total);
    }

    private NearbyPage load(NearbyCriteria criteria, Instant now) {
        NearbyPage page = repository.nearby(criteria, now);
        if (!criteria.listsMatchingItems() || page.rows().isEmpty()) {
            return page;
        }
        Map<UUID, List<MatchingItem>> items =
                repository.matchingItems(
                        page.rows().stream().map(MarkerRow::id).toList(),
                        criteria.itemFilter(),
                        properties.matchingItemsPerCollector(),
                        now);
        return new NearbyPage(
                page.rows().stream()
                        .map(row -> row.withMatchingItems(items.getOrDefault(row.id(), List.of())))
                        .toList(),
                page.total());
    }

    /**
     * {@code GET /collectors/{handle}/preview}: the marker of one collector on the map plus {@code
     * canMessage} and {@code isBlocked}. 404 when the collector is not on the map for the viewer
     * (unknown, suspended, pending deletion, not discoverable, PRIVATE profile).
     */
    @Transactional(readOnly = true)
    public CollectorPreview preview(
            @Nullable UUID viewerId, String handle, @Nullable Double lat, @Nullable Double lng) {
        Instant now = timeProvider.now();
        UserAccountSnapshot account =
                userAccountService
                        .findByHandle(handle)
                        .filter(candidate -> isPubliclyVisible(candidate, now))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        UUID targetId = account.id();
        PrivacySettingsView privacy = privacySettingsService.settingsOf(targetId);
        if (!privacyPolicy.canAppearOnMap(
                new ViewerContext(viewerId, false, false), targetId, privacy)) {
            throw ApiException.notFound(NOT_FOUND);
        }
        @Nullable SearchCentre centre = null;
        if (lat != null || lng != null || viewerId != null) {
            centre = geoScopes.resolve(viewerId, lat, lng, null, false).centre();
        }
        MarkerRow row =
                repository.markersByIds(List.of(targetId), centre, now).stream()
                        .findFirst()
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        boolean blocked = assembler.isBlocked(viewerId, targetId);
        ViewerContext viewer =
                new ViewerContext(
                        viewerId, viewerId != null && profileService.isComplete(viewerId), blocked);
        CollectorMarker marker = assembler.marker(row, viewer, now);
        if (!targetId.equals(viewerId)) {
            events.publishEvent(
                    new CollectorPreviewed(
                            viewerId, targetId, row.gridCell(), row.publicLabel(), now));
        }
        return new CollectorPreview(
                marker, privacyPolicy.canMessage(viewer, targetId, privacy), blocked);
    }

    /**
     * Markers of the given collectors as {@code viewerId} sees them (Phase 6 wishlist matches):
     * only collectors on the map and not blocked with the viewer are returned; distance buckets are
     * measured from the viewer's own trading area (snapped, never exposed), when they have one.
     */
    @Transactional(readOnly = true)
    public Map<UUID, CollectorMarker> markersFor(UUID viewerId, Collection<UUID> ids) {
        Map<UUID, CollectorMarker> result = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        Instant now = timeProvider.now();
        @Nullable SearchCentre centre =
                geoScopes.resolve(viewerId, null, null, null, false).centre();
        ViewerContext viewer =
                new ViewerContext(viewerId, profileService.isComplete(viewerId), false);
        List<MarkerRow> rows = repository.markersByIds(ids, centre, now);
        Set<UUID> blocked = assembler.blockedAmong(viewerId, rows);
        for (MarkerRow row : rows) {
            if (!blocked.contains(row.id())) {
                result.put(row.id(), assembler.marker(row, viewer, now));
            }
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Validation helpers (shared with the search service)
    // ---------------------------------------------------------------------------------------

    /** The ACTIVE game's slug, lower-cased; adds a field error for unknown games. */
    @Nullable String normaliseGame(@Nullable String game, List<ProblemFieldError> errors) {
        if (game == null || game.isBlank()) {
            return null;
        }
        String slug = game.trim().toLowerCase(Locale.ROOT);
        if (games.find(slug).filter(GameView::isActive).isEmpty()) {
            errors.add(new ProblemFieldError("game", "unknown game"));
            return null;
        }
        return slug;
    }

    static List<String> normaliseTags(List<String> raw, List<ProblemFieldError> errors) {
        List<String> tags = new ArrayList<>();
        for (String value : raw) {
            for (String part : value.split(",")) {
                String slug = part.trim().toLowerCase(Locale.ROOT);
                if (slug.isEmpty()) {
                    continue;
                }
                if (!TAG_SLUG.matcher(slug).matches() || slug.length() > 48) {
                    errors.add(new ProblemFieldError("tags", "must be tag slugs"));
                    return List.of();
                }
                if (!tags.contains(slug)) {
                    tags.add(slug);
                }
            }
        }
        if (tags.size() > MAX_TAGS) {
            errors.add(new ProblemFieldError("tags", "at most " + MAX_TAGS + " tags"));
        }
        return tags;
    }

    static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Active accounts, including those whose temporary suspension has already ended. */
    static boolean isPubliclyVisible(UserAccountSnapshot account, Instant now) {
        return switch (account.status()) {
            case ACTIVE -> true;
            case SUSPENDED -> !account.isSuspendedAt(now);
            case DELETION_REQUESTED, DELETED -> false;
        };
    }

    /**
     * Markers found by the engine.
     *
     * @param markers ranked markers, at most the limit
     * @param total matching collectors (blocked ones excluded)
     */
    record Found(List<CollectorMarker> markers, long total) {}
}
