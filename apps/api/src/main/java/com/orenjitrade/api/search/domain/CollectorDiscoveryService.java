package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.RegionCatalog;
import com.orenjitrade.api.location.domain.RegionView;
import com.orenjitrade.api.profiles.domain.ProfileService;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.search.infra.CollectorSearchRepository;
import com.orenjitrade.api.search.infra.DiscoveryCache;
import com.orenjitrade.api.users.domain.UserAccountSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The collector engine of discovery (ADR 0017): the collectors section of the unified search and
 * the markers of wishlist matches. Only discoverable, ACTIVE collectors with a location whose
 * profile is not PRIVATE appear, with their state/province and country; results are cached per
 * request key for 60 s and made viewer-specific afterwards ({@link MarkerAssembler}). Also resolves
 * the region that scopes a request: the {@code region} parameter (validated, never used for
 * authorization), else the caller's home region, else the default region.
 */
@Service
public class CollectorDiscoveryService {

    static final Pattern TAG_SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    static final int MAX_TAGS = 12;

    private final CollectorSearchRepository repository;
    private final DiscoveryCache cache;
    private final MarkerAssembler assembler;
    private final GameService games;
    private final RegionCatalog regions;
    private final LocationService locationService;
    private final ProfileService profileService;
    private final SearchProperties properties;
    private final TimeProvider timeProvider;

    public CollectorDiscoveryService(
            CollectorSearchRepository repository,
            DiscoveryCache cache,
            MarkerAssembler assembler,
            GameService games,
            RegionCatalog regions,
            LocationService locationService,
            ProfileService profileService,
            SearchProperties properties,
            TimeProvider timeProvider) {
        this.repository = repository;
        this.cache = cache;
        this.assembler = assembler;
        this.games = games;
        this.regions = regions;
        this.locationService = locationService;
        this.profileService = profileService;
        this.properties = properties;
        this.timeProvider = timeProvider;
    }

    /**
     * The region scoping a request: {@code requested} when given ({@code 400 VALIDATION_FAILED} on
     * {@code region} when unknown), else the viewer's home region, else the default region.
     */
    @Transactional(readOnly = true)
    public RegionView scope(@Nullable UUID viewerId, @Nullable String requested) {
        if (requested != null && !requested.isBlank()) {
            return regions.requireRegion(requested, "region");
        }
        @Nullable String home =
                viewerId == null ? null : locationService.homeRegionOf(viewerId).orElse(null);
        return regions.resolve(null, home);
    }

    /**
     * The collector engine: cached rows, matching items, then viewer-specific markers (blocked
     * collectors removed), at most {@code criteria.limit()}.
     */
    Found find(DiscoveryCriteria criteria, @Nullable UUID viewerId, Instant now) {
        DiscoveryPage page = cache.get(criteria, () -> load(criteria, now));
        List<CollectorMarker> markers = assembler.visibleMarkers(page.rows(), viewerId, now);
        long hidden = page.rows().size() - markers.size();
        long total = Math.max(0, page.total() - hidden);
        List<CollectorMarker> limited =
                markers.size() > criteria.limit() ? markers.subList(0, criteria.limit()) : markers;
        return new Found(List.copyOf(limited), total);
    }

    private DiscoveryPage load(DiscoveryCriteria criteria, Instant now) {
        DiscoveryPage page = repository.discover(criteria, now);
        if (!criteria.listsMatchingItems() || page.rows().isEmpty()) {
            return page;
        }
        Map<UUID, List<MatchingItem>> items =
                repository.matchingItems(
                        page.rows().stream().map(MarkerRow::id).toList(),
                        criteria.itemFilter(),
                        properties.matchingItemsPerCollector(),
                        now);
        return new DiscoveryPage(
                page.rows().stream()
                        .map(row -> row.withMatchingItems(items.getOrDefault(row.id(), List.of())))
                        .toList(),
                page.total());
    }

    /**
     * Markers of the given collectors as {@code viewerId} sees them (Phase 6 wishlist matches):
     * only discoverable collectors with a location and no block with the viewer are returned.
     */
    @Transactional(readOnly = true)
    public Map<UUID, CollectorMarker> markersFor(UUID viewerId, Collection<UUID> ids) {
        Map<UUID, CollectorMarker> result = new LinkedHashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        Instant now = timeProvider.now();
        ViewerContext viewer =
                new ViewerContext(viewerId, profileService.isComplete(viewerId), false);
        List<MarkerRow> rows = repository.markersByIds(ids, now);
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
