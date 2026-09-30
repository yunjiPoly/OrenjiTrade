package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.binders.domain.PublicBinderService;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.cards.domain.CardSuggestion;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogResolution;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.storage.ObjectStorage;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.domain.InventoryItemView;
import com.orenjitrade.api.inventory.domain.PublicInventoryService;
import com.orenjitrade.api.location.domain.RegionGeocoder;
import com.orenjitrade.api.location.domain.SearchCentre;
import com.orenjitrade.api.profiles.domain.TagService;
import com.orenjitrade.api.profiles.domain.TagView;
import com.orenjitrade.api.profiles.domain.ViewerContext;
import com.orenjitrade.api.search.domain.DiscoveryResults.CardHolder;
import com.orenjitrade.api.search.domain.DiscoveryResults.Suggestion;
import com.orenjitrade.api.search.domain.DiscoveryResults.UnifiedSearch;
import com.orenjitrade.api.search.events.SearchPerformed;
import com.orenjitrade.api.search.infra.BinderSearchRepository;
import com.orenjitrade.api.search.infra.BinderSearchRepository.BinderName;
import com.orenjitrade.api.search.infra.CardHolderRepository;
import com.orenjitrade.api.search.infra.CardHolderRepository.HolderPage;
import com.orenjitrade.api.search.infra.CollectorSearchRepository;
import com.orenjitrade.api.search.infra.CollectorSearchRepository.CollectorHit;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Unified search (Phase 4 contract): {@code GET /search} over cards, printings, sets, collectors
 * and public binders with printing/card resolution and nearby holders, {@code GET
 * /search/card-holders} ("who near me has this card") and {@code GET /search/suggest} (mixed
 * autocomplete). PostgreSQL full text and trigrams only (ADR 0012); geography through public points
 * (ADR 0004). Emits {@code SearchPerformed} for analytics.
 */
@Service
public class SearchService {

    static final Pattern CODE = Pattern.compile("^[A-Z][A-Z0-9_]{1,31}$");
    static final Pattern LANGUAGE = Pattern.compile("^[a-z]{2}$");

    private final CatalogService catalogService;
    private final CollectorDiscoveryService discovery;
    private final CollectorSearchRepository collectors;
    private final CardHolderRepository cardHolders;
    private final BinderSearchRepository binders;
    private final PublicBinderService publicBinderService;
    private final PublicInventoryService publicInventoryService;
    private final TagService tagService;
    private final MarkerAssembler assembler;
    private final GeoScopeResolver geoScopes;
    private final RegionGeocoder regionGeocoder;
    private final ObjectStorage storage;
    private final TimeProvider timeProvider;
    private final ApplicationEventPublisher events;

    public SearchService(
            CatalogService catalogService,
            CollectorDiscoveryService discovery,
            CollectorSearchRepository collectors,
            CardHolderRepository cardHolders,
            BinderSearchRepository binders,
            PublicBinderService publicBinderService,
            PublicInventoryService publicInventoryService,
            TagService tagService,
            MarkerAssembler assembler,
            GeoScopeResolver geoScopes,
            RegionGeocoder regionGeocoder,
            ObjectStorage storage,
            TimeProvider timeProvider,
            ApplicationEventPublisher events) {
        this.catalogService = catalogService;
        this.discovery = discovery;
        this.collectors = collectors;
        this.cardHolders = cardHolders;
        this.binders = binders;
        this.publicBinderService = publicBinderService;
        this.publicInventoryService = publicInventoryService;
        this.tagService = tagService;
        this.assembler = assembler;
        this.geoScopes = geoScopes;
        this.regionGeocoder = regionGeocoder;
        this.storage = storage;
        this.timeProvider = timeProvider;
        this.events = events;
    }

    // ---------------------------------------------------------------------------------------
    // GET /search
    // ---------------------------------------------------------------------------------------

    /**
     * A unified search request.
     *
     * @param q query text
     * @param types sections to fill (all when empty)
     * @param game game slug
     * @param lat centre latitude
     * @param lng centre longitude
     * @param radiusKm radius, capped by the plan
     * @param limit maximum entries per section
     */
    public record UnifiedQuery(
            String q,
            Set<SearchType> types,
            @Nullable String game,
            @Nullable Double lat,
            @Nullable Double lng,
            @Nullable Double radiusKm,
            int limit) {}

    /**
     * {@code GET /search}: every requested section; when {@code q} designates a printing or a card
     * unambiguously (an exact printing code, an exact card name, or a single card hit), {@code
     * resolved} is set and {@code collectors} lists the holders of it (nearby when a centre is
     * known), otherwise collectors matching the text.
     */
    @Transactional(readOnly = true)
    public UnifiedSearch search(@Nullable UUID viewerId, UnifiedQuery query) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable String game = discovery.normaliseGame(query.game(), errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        String q = query.q().trim();
        Set<SearchType> types =
                query.types().isEmpty() ? EnumSet.allOf(SearchType.class) : query.types();
        GeoScope scope =
                geoScopes.resolve(viewerId, query.lat(), query.lng(), query.radiusKm(), false);
        Instant now = timeProvider.now();
        int limit = query.limit();

        @Nullable CatalogResolution resolved = catalogService.resolve(game, q).orElse(null);
        List<CardSummary> cards = List.of();
        if (types.contains(SearchType.CARDS)) {
            PageResponse<CardSummary> page =
                    catalogService.searchCards(
                            new CatalogService.CardQuery(
                                    game, q, null, null, null, null, Map.of(), 0, limit));
            cards = page.items();
            if (resolved == null && page.totalItems() == 1) {
                resolved = new CatalogResolution(null, cards.get(0).id());
            }
        }
        List<PrintingSummary> printings =
                types.contains(SearchType.PRINTINGS)
                        ? catalogService.searchPrintings(
                                game, q, resolved == null ? null : resolved.cardId(), limit)
                        : List.of();
        List<SetSummary> sets =
                types.contains(SearchType.SETS)
                        ? catalogService.sets(game, q, 0, limit).items()
                        : List.of();
        List<CollectorMarker> found = List.of();
        if (types.contains(SearchType.COLLECTORS)) {
            NearbyCriteria criteria =
                    resolved != null
                            ? new NearbyCriteria(
                                    scope.centre(),
                                    scope.radiusKm(),
                                    null,
                                    null,
                                    null,
                                    List.of(),
                                    resolved.printingId(),
                                    resolved.printingId() == null ? resolved.cardId() : null,
                                    null,
                                    limit)
                            : new NearbyCriteria(
                                    scope.centre(),
                                    scope.radiusKm(),
                                    game,
                                    null,
                                    null,
                                    List.of(),
                                    null,
                                    null,
                                    q,
                                    limit);
            found = discovery.find(criteria, viewerId, now).markers();
        }
        List<PublicBinderHit> binderHits = List.of();
        if (types.contains(SearchType.BINDERS)) {
            binderHits =
                    publicBinderService.publicBinders(
                            viewerId, binders.search(q, game, scope, limit, now));
        }
        UnifiedSearch result =
                new UnifiedSearch(q, cards, printings, sets, found, binderHits, resolved);
        events.publishEvent(
                new SearchPerformed(
                        SearchPerformed.SURFACE_SEARCH,
                        viewerId,
                        q,
                        game,
                        types.stream().map(SearchType::key).sorted().toList(),
                        resolved == null
                                ? "none"
                                : resolved.printingId() != null ? "printing" : "card",
                        result.resultCount(),
                        scope.hasCentre() ? scope.radiusKmRounded() : null,
                        game == null ? List.of() : List.of("game"),
                        scope.hasCentre() ? scope.centre().gridCell() : null,
                        label(scope.centre()),
                        now));
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // GET /search/card-holders
    // ---------------------------------------------------------------------------------------

    /**
     * A card-holder request as received (strings validated here).
     *
     * @param printingId holders of this printing (exactly one of printingId, cardId)
     * @param cardId holders of any printing of this card
     * @param lat centre latitude (required for signed-out callers)
     * @param lng centre longitude
     * @param radiusKm radius, capped by the plan
     * @param availability availability filter
     * @param condition condition code
     * @param minPrice lowest asking price
     * @param maxPrice highest asking price
     * @param freshness ACTIVE or AGING
     * @param edition edition code
     * @param language ISO 639-1 code
     * @param acceptsOffers offers welcome
     * @param sort distance, price or freshness
     * @param page zero-based page
     * @param size page size
     */
    public record HolderQuery(
            @Nullable UUID printingId,
            @Nullable UUID cardId,
            @Nullable Double lat,
            @Nullable Double lng,
            @Nullable Double radiusKm,
            @Nullable SearchAvailability availability,
            @Nullable String condition,
            @Nullable BigDecimal minPrice,
            @Nullable BigDecimal maxPrice,
            @Nullable FreshnessState freshness,
            @Nullable String edition,
            @Nullable String language,
            @Nullable Boolean acceptsOffers,
            HolderSort sort,
            int page,
            int size) {}

    /**
     * {@code GET /search/card-holders}: effectively public, fresh (ACTIVE or AGING) items of the
     * printing or card held by collectors on the map within the radius (the caller's own items
     * excluded), with each holder's marker.
     */
    @Transactional(readOnly = true)
    public PageResponse<CardHolder> cardHolders(@Nullable UUID viewerId, HolderQuery query) {
        List<ProblemFieldError> errors = new ArrayList<>();
        if ((query.printingId() == null) == (query.cardId() == null)) {
            errors.add(new ProblemFieldError("printingId", "exactly one of printingId, cardId"));
        }
        @Nullable String condition = code("condition", query.condition(), errors);
        @Nullable String edition = code("edition", query.edition(), errors);
        @Nullable String language = null;
        if (query.language() != null && !query.language().isBlank()) {
            language = query.language().trim().toLowerCase(Locale.ROOT);
            if (!LANGUAGE.matcher(language).matches()) {
                errors.add(new ProblemFieldError("language", "must be an ISO 639-1 code"));
            }
        }
        if (query.minPrice() != null
                && query.maxPrice() != null
                && query.minPrice().compareTo(query.maxPrice()) > 0) {
            errors.add(new ProblemFieldError("minPrice", "must not exceed maxPrice"));
        }
        if (query.freshness() != null
                && query.freshness() != FreshnessState.ACTIVE
                && query.freshness() != FreshnessState.AGING) {
            errors.add(
                    new ProblemFieldError(
                            "freshness", "must be ACTIVE or AGING (stale listings never appear)"));
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        GeoScope scope =
                geoScopes.resolve(viewerId, query.lat(), query.lng(), query.radiusKm(), true);
        ItemFilter filter =
                new ItemFilter(
                        query.printingId(),
                        query.cardId(),
                        null,
                        query.availability(),
                        condition,
                        query.minPrice(),
                        query.maxPrice(),
                        query.freshness(),
                        edition,
                        language,
                        query.acceptsOffers());
        Instant now = timeProvider.now();
        HolderPage page =
                cardHolders.page(
                        filter, scope, query.sort(), viewerId, query.page(), query.size(), now);
        List<CardHolder> rows = new ArrayList<>();
        if (!page.holders().isEmpty()) {
            List<InventoryItemView> items =
                    publicInventoryService.publicItems(
                            page.holders().stream()
                                    .map(CardHolderRepository.Holder::itemId)
                                    .toList());
            Map<UUID, MarkerRow> owners = new HashMap<>();
            collectors
                    .markersByIds(
                            new LinkedHashSet<>(
                                    page.holders().stream()
                                            .map(CardHolderRepository.Holder::ownerId)
                                            .toList()),
                            scope.centre(),
                            now)
                    .forEach(row -> owners.put(row.id(), row));
            ViewerContext viewer = new ViewerContext(viewerId, false, false);
            for (InventoryItemView item : items) {
                @Nullable MarkerRow owner = owners.get(item.row().ownerId());
                if (owner == null || assembler.isBlocked(viewerId, owner.id())) {
                    continue;
                }
                rows.add(new CardHolder(assembler.marker(owner, viewer, now), item));
            }
        }
        events.publishEvent(
                new SearchPerformed(
                        SearchPerformed.SURFACE_CARD_HOLDERS,
                        viewerId,
                        null,
                        null,
                        List.of(),
                        query.printingId() != null ? "printing" : "card",
                        page.total(),
                        scope.radiusKmRounded(),
                        filter.names(),
                        scope.hasCentre() ? scope.centre().gridCell() : null,
                        label(scope.centre()),
                        now));
        return PageResponse.of(rows, query.page(), query.size(), page.total());
    }

    // ---------------------------------------------------------------------------------------
    // GET /search/suggest
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /search/suggest}: mixed autocomplete. Printing codes and cards (catalog suggest),
     * collectors on the map who allow name search (closest first when a centre is known), sets,
     * public binders and tags, interleaved one per kind in that order until {@code limit}.
     */
    @Transactional(readOnly = true)
    public List<Suggestion> suggest(
            @Nullable UUID viewerId,
            String q,
            @Nullable String gameSlug,
            @Nullable Double lat,
            @Nullable Double lng,
            int limit) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable String game = discovery.normaliseGame(gameSlug, errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        String text = q.trim();
        @Nullable SearchCentre centre =
                lat != null || lng != null || viewerId != null
                        ? geoScopes.resolve(viewerId, lat, lng, null, false).centre()
                        : null;
        Instant now = timeProvider.now();

        List<Deque<Suggestion>> sources = new ArrayList<>();
        Deque<Suggestion> catalog = new ArrayDeque<>();
        for (CardSuggestion card : catalogService.suggest(game, text, limit)) {
            boolean printing = CardSuggestion.PRINTING.equals(card.kind());
            catalog.add(
                    new Suggestion(
                            printing ? SuggestionType.PRINTING : SuggestionType.CARD,
                            printing && card.printingId() != null ? card.printingId() : card.id(),
                            card.name(),
                            joinNonBlank(card.printingCode(), card.setCode()),
                            card.imageUrl(),
                            card.game(),
                            null,
                            printing ? card.id() : null));
        }
        sources.add(catalog);
        Deque<Suggestion> people = new ArrayDeque<>();
        for (CollectorHit hit : collectors.suggest(text, centre, limit, now)) {
            if (assembler.isBlocked(viewerId, hit.id())) {
                continue;
            }
            people.add(
                    new Suggestion(
                            SuggestionType.COLLECTOR,
                            hit.id(),
                            hit.displayName(),
                            joinNonBlank("@" + hit.handle(), hit.publicLabel()),
                            hit.avatarKey() == null ? null : storage.publicUrl(hit.avatarKey()),
                            null,
                            hit.handle(),
                            null));
        }
        sources.add(people);
        Deque<Suggestion> sets = new ArrayDeque<>();
        for (SetSummary set : catalogService.sets(game, text, 0, limit).items()) {
            sets.add(
                    new Suggestion(
                            SuggestionType.SET,
                            set.id(),
                            set.name(),
                            set.code(),
                            null,
                            set.game(),
                            null,
                            null));
        }
        sources.add(sets);
        Deque<Suggestion> binderEntries = new ArrayDeque<>();
        for (BinderName binder : binders.suggest(text, limit, now)) {
            if (assembler.isBlocked(viewerId, binder.ownerId())) {
                continue;
            }
            binderEntries.add(
                    new Suggestion(
                            SuggestionType.BINDER,
                            binder.id(),
                            binder.name(),
                            null,
                            null,
                            null,
                            null,
                            null));
        }
        sources.add(binderEntries);
        Deque<Suggestion> tags = new ArrayDeque<>();
        for (TagView tag : tagService.search(text, null, limit)) {
            tags.add(
                    new Suggestion(
                            SuggestionType.TAG,
                            tag.id(),
                            tag.label(),
                            null,
                            null,
                            null,
                            tag.slug(),
                            null));
        }
        sources.add(tags);
        return interleave(sources, limit);
    }

    /** One entry per source in turn until {@code limit} entries or every source is exhausted. */
    static List<Suggestion> interleave(List<Deque<Suggestion>> sources, int limit) {
        List<Suggestion> result = new ArrayList<>();
        boolean progressed = true;
        while (result.size() < limit && progressed) {
            progressed = false;
            for (Deque<Suggestion> source : sources) {
                if (result.size() >= limit) {
                    break;
                }
                Suggestion next = source.pollFirst();
                if (next != null) {
                    result.add(next);
                    progressed = true;
                }
            }
        }
        return result;
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private @Nullable String label(@Nullable SearchCentre centre) {
        return centre == null ? null : regionGeocoder.labelFor(centre.lat(), centre.lng());
    }

    private static @Nullable String code(
            String field, @Nullable String value, List<ProblemFieldError> errors) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String code = value.trim().toUpperCase(Locale.ROOT);
        if (!CODE.matcher(code).matches()) {
            errors.add(new ProblemFieldError(field, "must be a code such as NEAR_MINT"));
            return null;
        }
        return code;
    }

    private static @Nullable String joinNonBlank(@Nullable String first, @Nullable String second) {
        List<String> parts = new ArrayList<>();
        if (first != null && !first.isBlank()) {
            parts.add(first);
        }
        if (second != null && !second.isBlank()) {
            parts.add(second);
        }
        return parts.isEmpty() ? null : String.join(" · ", parts);
    }

    /** Parses {@code types=cards,printings,...} (400 for unknown names). */
    public static Set<SearchType> parseTypes(List<String> raw) {
        Set<SearchType> types = EnumSet.noneOf(SearchType.class);
        List<ProblemFieldError> errors = new ArrayList<>();
        for (String value : raw) {
            for (String part : value.split(",")) {
                if (part.isBlank()) {
                    continue;
                }
                Optional<SearchType> type = SearchType.parse(part);
                if (type.isEmpty()) {
                    errors.add(
                            new ProblemFieldError(
                                    "types",
                                    "must be among cards, printings, sets, collectors, binders"));
                } else {
                    types.add(type.get());
                }
            }
        }
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return types;
    }
}
