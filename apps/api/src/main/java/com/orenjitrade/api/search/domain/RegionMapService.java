package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.TimeCursor;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.location.domain.CountryView;
import com.orenjitrade.api.location.domain.RegionCatalog;
import com.orenjitrade.api.location.domain.RegionView;
import com.orenjitrade.api.search.events.SearchPerformed;
import com.orenjitrade.api.search.infra.DiscoveryCache;
import com.orenjitrade.api.search.infra.RegionBinderRepository;
import com.orenjitrade.api.search.infra.RegionBinderRepository.BinderRef;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The map (ADR 0017, spec section 3): how many public binders (and deck cores, stage R3) of
 * discoverable collectors each subdivision of a platform region holds, and the binders of one
 * subdivision or of the whole region. No collectors, pins or points: the shading is per
 * state/province. Anonymous counts are cached with the discovery cache (same invalidation);
 * signed-in counts leave out collectors blocked with the viewer.
 */
@Service
public class RegionMapService {

    public static final int MAX_PAGE_SIZE = 50;
    static final String REGION_NOT_FOUND = "Region not found";
    static final String SUBDIVISION_NOT_FOUND = "State or province not found in this region";

    private final RegionCatalog regions;
    private final RegionBinderRepository repository;
    private final PublicBinderService publicBinderService;
    private final DiscoveryCache cache;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public RegionMapService(
            RegionCatalog regions,
            RegionBinderRepository repository,
            PublicBinderService publicBinderService,
            DiscoveryCache cache,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.regions = regions;
        this.repository = repository;
        this.publicBinderService = publicBinderService;
        this.cache = cache;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    /**
     * Public binders per subdivision of {@code regionCode} ({@code 404} for an unknown region). A
     * signed-in viewer's counts leave out collectors blocked with them (computed live); anonymous
     * counts are cached.
     */
    @Transactional(readOnly = true)
    public BinderCounts binderCounts(@Nullable UUID viewerId, String regionCode) {
        RegionView region = requireRegion(regionCode);
        Instant now = timeProvider.now();
        if (viewerId != null) {
            return BinderCounts.of(
                    region.code(), repository.countsBySubdivision(region.code(), viewerId, now));
        }
        // v2: the counts carry the deck cores (stage R3); entries of the earlier shape are skipped.
        return cache.get(
                "binder-counts:v2|" + region.code(),
                BinderCounts.class,
                () ->
                        BinderCounts.of(
                                region.code(),
                                repository.countsBySubdivision(region.code(), null, now)));
    }

    /**
     * The public binders of discoverable collectors located in {@code subdivisionCode} of {@code
     * regionCode}, most recently updated first ({@code 404} when the region is unknown or the
     * subdivision does not belong to it).
     *
     * @param deckCore deck cores only ({@code true}), other binders only ({@code false}) or both
     * @param text a binder's name or description, its owner's handle, a deck core's card names;
     *     blank or {@code null} for every binder
     */
    @Transactional(readOnly = true)
    public CursorPage<PublicBinderHit> subdivisionBinders(
            @Nullable UUID viewerId,
            String regionCode,
            String subdivisionCode,
            @Nullable Boolean deckCore,
            @Nullable String text,
            @Nullable String cursor,
            int limit) {
        RegionView region = requireRegion(regionCode);
        String code = subdivisionCode.trim().toUpperCase(Locale.ROOT);
        boolean inRegion =
                regions.countryOfSubdivision(code)
                        .map(CountryView::regionCode)
                        .filter(region.code()::equals)
                        .isPresent();
        if (!inRegion) {
            throw ApiException.notFound(SUBDIVISION_NOT_FOUND);
        }
        return binders(viewerId, region, code, deckCore, text, cursor, limit);
    }

    /**
     * The public binders of discoverable collectors anywhere in {@code regionCode} (Search ›
     * Binders without a state, stage R5), most recently updated first ({@code 404} for an unknown
     * region); the filters of {@link #subdivisionBinders}.
     */
    @Transactional(readOnly = true)
    public CursorPage<PublicBinderHit> regionBinders(
            @Nullable UUID viewerId,
            String regionCode,
            @Nullable Boolean deckCore,
            @Nullable String text,
            @Nullable String cursor,
            int limit) {
        return binders(viewerId, requireRegion(regionCode), null, deckCore, text, cursor, limit);
    }

    private CursorPage<PublicBinderHit> binders(
            @Nullable UUID viewerId,
            RegionView region,
            @Nullable String subdivisionCode,
            @Nullable Boolean deckCore,
            @Nullable String text,
            @Nullable String cursor,
            int limit) {
        @Nullable TimeCursor after = TimeCursor.decode(cursor);
        int size = Math.max(1, Math.min(limit, MAX_PAGE_SIZE));
        @Nullable String query = text == null || text.isBlank() ? null : text.trim();
        Instant now = timeProvider.now();
        List<BinderRef> refs =
                repository.binders(
                        region.code(),
                        subdivisionCode,
                        viewerId,
                        deckCore,
                        query,
                        after,
                        size + 1,
                        now);
        boolean more = refs.size() > size;
        List<BinderRef> page = more ? refs.subList(0, size) : refs;
        List<PublicBinderHit> hits =
                publicBinderService.publicBinders(
                        viewerId, page.stream().map(BinderRef::id).toList());
        if (after == null) {
            events.publishEvent(
                    new SearchPerformed(
                            SearchPerformed.SURFACE_MAP,
                            viewerId,
                            null,
                            null,
                            List.of(),
                            "none",
                            hits.size(),
                            filterNames(deckCore, query),
                            region.code(),
                            subdivisionCode,
                            now));
        }
        if (!more) {
            return CursorPage.last(hits);
        }
        BinderRef last = page.get(page.size() - 1);
        return CursorPage.of(hits, new TimeCursor(last.updatedAt(), last.id()).encode());
    }

    /** Names of the filters in use (analytics; never the text). */
    private static List<String> filterNames(@Nullable Boolean deckCore, @Nullable String text) {
        List<String> names = new java.util.ArrayList<>();
        if (deckCore != null) {
            names.add("deck_core");
        }
        if (text != null) {
            names.add("text");
        }
        return names;
    }

    private RegionView requireRegion(String code) {
        return regions.region(code.trim().toLowerCase(Locale.ROOT))
                .orElseThrow(() -> ApiException.notFound(REGION_NOT_FOUND));
    }

    /**
     * Binder counts of a region.
     *
     * @param region region code
     * @param total public binders in the region (deck cores included)
     * @param deckCoreTotal the deck cores among them
     * @param subdivisions counts per subdivision code (only subdivisions holding binders)
     */
    public record BinderCounts(
            String region, long total, long deckCoreTotal, List<SubdivisionCount> subdivisions) {

        public BinderCounts {
            subdivisions = List.copyOf(subdivisions);
        }

        static BinderCounts of(String region, Map<String, RegionBinderRepository.Counts> counts) {
            List<SubdivisionCount> list =
                    counts.entrySet().stream()
                            .map(
                                    entry ->
                                            new SubdivisionCount(
                                                    entry.getKey(),
                                                    entry.getValue().binders(),
                                                    entry.getValue().deckCores()))
                            .toList();
            long total = list.stream().mapToLong(SubdivisionCount::binderCount).sum();
            long cores = list.stream().mapToLong(SubdivisionCount::deckCoreCount).sum();
            return new BinderCounts(region, total, cores, list);
        }
    }

    /**
     * Public binders of one subdivision.
     *
     * @param code subdivision code
     * @param binderCount public binders of discoverable collectors located there (deck cores
     *     included)
     * @param deckCoreCount the deck cores among them
     */
    public record SubdivisionCount(String code, long binderCount, long deckCoreCount) {}
}
