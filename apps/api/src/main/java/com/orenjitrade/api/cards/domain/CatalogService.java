package com.orenjitrade.api.cards.domain;

import com.orenjitrade.api.cards.events.CardViewed;
import com.orenjitrade.api.cards.infra.CatalogQueryRepository;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
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
import tools.jackson.databind.json.JsonMapper;

/**
 * The cards module's read service (public catalog endpoints and, from Phase 3 on, printing lookups
 * for other modules). Validates filters against the game's {@link GameSchema}: {@code
 * metadata.<key>} filters need a game and a filterable field; values are typed per the schema and
 * matched with JSONB containment ({@code card.metadata @> ...}, GIN index).
 */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    /** Prefix of metadata filter parameters ({@code metadata.level=4}). */
    public static final String METADATA_PREFIX = "metadata.";

    static final Pattern SET_CODE = Pattern.compile("^[A-Za-z0-9]{2,10}$");
    static final Pattern LANGUAGE = Pattern.compile("^[a-z]{2}$");
    static final Pattern EDITION = Pattern.compile(GameSchema.CODE);

    private final CatalogQueryRepository queries;
    private final GameService gameService;
    private final JsonMapper jsonMapper;
    private final ApplicationEventPublisher events;
    private final TimeProvider timeProvider;

    public CatalogService(
            CatalogQueryRepository queries,
            GameService gameService,
            JsonMapper jsonMapper,
            ApplicationEventPublisher events,
            TimeProvider timeProvider) {
        this.queries = queries;
        this.gameService = gameService;
        this.jsonMapper = jsonMapper;
        this.events = events;
        this.timeProvider = timeProvider;
    }

    // ---------------------------------------------------------------------------------------
    // Cards
    // ---------------------------------------------------------------------------------------

    /**
     * {@code GET /cards}: an exact printing code ({@code LOB-EN001}) short-circuits to that card;
     * otherwise full-text search with a trigram fallback, filtered by game, set, printing
     * attributes and metadata.
     */
    public PageResponse<CardSummary> searchCards(CardQuery query) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable GameView game = resolveGame(query.game(), errors);
        @Nullable UUID setId = null;
        @Nullable String setCode = null;
        if (query.set() != null && !query.set().isBlank()) {
            String set = query.set().trim();
            Optional<UUID> asId = parseUuid(set);
            if (asId.isPresent()) {
                setId = asId.get();
            } else if (SET_CODE.matcher(set).matches()) {
                setCode = set.toUpperCase(Locale.ROOT);
            } else {
                errors.add(new ProblemFieldError("set", "must be a set id or a set code"));
            }
        }
        @Nullable String language = blankToNull(query.language());
        if (language != null && !LANGUAGE.matcher(language).matches()) {
            errors.add(new ProblemFieldError("language", "must be an ISO 639-1 code"));
        }
        @Nullable String edition = blankToNull(query.edition());
        if (edition != null) {
            edition = edition.toUpperCase(Locale.ROOT);
            if (!EDITION.matcher(edition).matches()) {
                errors.add(new ProblemFieldError("edition", "must be an edition code"));
            }
        }
        @Nullable String metadataJson = metadataFilter(game, query.metadata(), errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }

        @Nullable String text = blankToNull(query.query());
        Optional<String> code = CatalogText.asPrintingCode(text);
        if (code.isPresent()) {
            Optional<UUID> cardId =
                    queries.cardIdByPrintingCode(code.get(), game == null ? null : game.id());
            if (cardId.isPresent()) {
                List<CardSummary> items =
                        queries.findCardSummary(cardId.get(), true).map(this::summary).stream()
                                .toList();
                return PageResponse.of(
                        query.page() == 0 ? items : List.of(),
                        query.page(),
                        query.size(),
                        items.size());
            }
        }
        CatalogQueryRepository.Page<CardSummary> page =
                queries.searchCards(
                        new CardSearchCriteria(
                                game == null ? null : game.id(),
                                text,
                                setId,
                                setCode,
                                blankToNull(query.rarity()),
                                language,
                                edition,
                                metadataJson,
                                query.page(),
                                query.size()));
        return PageResponse.of(
                page.items().stream().map(this::summary).toList(),
                query.page(),
                query.size(),
                page.total());
    }

    /**
     * {@code GET /cards/suggest}: printing-code prefixes ({@code AZR-EN0}) first, then cards by
     * name (prefix, substring, full text, trigram), at most {@code limit} entries.
     */
    public List<CardSuggestion> suggest(@Nullable String gameSlug, String q, int limit) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable GameView game = resolveGame(gameSlug, errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        @Nullable UUID gameId = game == null ? null : game.id();
        List<CardSuggestion> result = new ArrayList<>();
        Optional<String> prefix = CatalogText.asPrintingCodePrefix(q);
        if (prefix.isPresent()) {
            result.addAll(queries.suggestPrintings(gameId, prefix.get(), limit));
        }
        if (result.size() < limit) {
            Set<UUID> seen = new LinkedHashSet<>();
            result.forEach(entry -> seen.add(entry.id()));
            for (CardSuggestion card : queries.suggestCards(gameId, q.trim(), limit)) {
                if (result.size() >= limit) {
                    break;
                }
                if (seen.add(card.id())) {
                    result.add(card);
                }
            }
        }
        return result;
    }

    /** {@code GET /cards/{id}}. */
    public CardDetail card(UUID id) {
        return cardDetail(id, true);
    }

    /** {@code GET /cards/{id}} as served to a visitor: also notifies {@link CardViewed}. */
    public CardDetail viewCard(@Nullable UUID viewerId, UUID id) {
        CardDetail card = card(id);
        events.publishEvent(
                new CardViewed(viewerId, card.id(), null, card.game(), timeProvider.now()));
        return card;
    }

    /** {@code GET /printings/{id}} as served to a visitor: also notifies {@link CardViewed}. */
    public PrintingDetail viewPrinting(@Nullable UUID viewerId, UUID id) {
        PrintingDetail printing = printing(id);
        events.publishEvent(
                new CardViewed(
                        viewerId,
                        printing.card().id(),
                        printing.printing().id(),
                        printing.card().game(),
                        timeProvider.now()));
        return printing;
    }

    // ---------------------------------------------------------------------------------------
    // Unified search support (Phase 4)
    // ---------------------------------------------------------------------------------------

    /**
     * What {@code q} designates unambiguously: an exact printing code carried by one printing
     * (printing + card) or by printings of a single card (card), else an exact card name matching
     * exactly one card. Empty otherwise (callers may still resolve a single search hit).
     *
     * @param gameSlug optional ACTIVE game restriction (400 when unknown)
     */
    public Optional<CatalogResolution> resolve(@Nullable String gameSlug, String q) {
        @Nullable UUID gameId = requireGameId(gameSlug);
        String text = q.trim();
        if (text.isEmpty()) {
            return Optional.empty();
        }
        Optional<String> code = CatalogText.asPrintingCode(text);
        if (code.isPresent()) {
            List<UUID[]> printings = queries.printingsByCode(code.get(), gameId);
            if (printings.size() == 1) {
                return Optional.of(new CatalogResolution(printings.get(0)[0], printings.get(0)[1]));
            }
            Set<UUID> cards = new LinkedHashSet<>();
            printings.forEach(pair -> cards.add(pair[1]));
            if (cards.size() == 1) {
                return Optional.of(new CatalogResolution(null, cards.iterator().next()));
            }
            if (!printings.isEmpty()) {
                return Optional.empty();
            }
        }
        List<UUID> byName = queries.cardIdsByExactName(CatalogText.normalise(text), gameId, 2);
        return byName.size() == 1
                ? Optional.of(new CatalogResolution(null, byName.get(0)))
                : Optional.empty();
    }

    /**
     * Printings for the unified search: printings whose code starts with {@code q} when it looks
     * like a printing code (or a prefix of one), else the printings of the resolved card, else
     * none; at most {@code limit}.
     */
    public List<PrintingSummary> searchPrintings(
            @Nullable String gameSlug, String q, @Nullable UUID resolvedCardId, int limit) {
        @Nullable UUID gameId = requireGameId(gameSlug);
        Optional<String> prefix = CatalogText.asPrintingCodePrefix(q);
        if (prefix.isPresent()) {
            List<PrintingSummary> byCode =
                    queries.printingsByCodePrefix(prefix.get(), gameId, limit);
            if (!byCode.isEmpty() || resolvedCardId == null) {
                return byCode;
            }
        }
        if (resolvedCardId == null) {
            return List.of();
        }
        List<PrintingSummary> printings = queries.printingsOfCard(resolvedCardId, true);
        return printings.size() <= limit ? printings : printings.subList(0, limit);
    }

    private @Nullable UUID requireGameId(@Nullable String gameSlug) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable GameView game = resolveGame(gameSlug, errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        return game == null ? null : game.id();
    }

    /** Card detail including cards of hidden games (admin responses). */
    public CardDetail cardDetail(UUID id, boolean activeOnly) {
        CardSummary card =
                queries.findCardSummary(id, activeOnly)
                        .orElseThrow(() -> ApiException.notFound("Card not found"));
        return new CardDetail(
                card.id(),
                card.game(),
                card.name(),
                card.slug(),
                card.cardType(),
                card.subtype(),
                queries.cardText(id),
                card.metadata(),
                card.primaryImageUrl(),
                queries.printingsOfCard(id, activeOnly));
    }

    /** {@code GET /cards/{id}/printings}. */
    public List<PrintingSummary> printingsOfCard(UUID cardId) {
        if (queries.findCardSummary(cardId, true).isEmpty()) {
            throw ApiException.notFound("Card not found");
        }
        return queries.printingsOfCard(cardId, true);
    }

    /** {@code GET /printings/{id}}. */
    public PrintingDetail printing(UUID id) {
        return printingDetail(id, true);
    }

    /** Printing detail including hidden games (admin responses). */
    public PrintingDetail printingDetail(UUID id, boolean activeOnly) {
        CatalogQueryRepository.PrintingRow row =
                queries.findPrinting(id, activeOnly)
                        .orElseThrow(() -> ApiException.notFound("Printing not found"));
        PrintingSummary printing = queries.withImages(List.of(row)).get(0);
        CardSummary card =
                queries.findCardSummary(row.cardId(), activeOnly).map(this::summary).orElseThrow();
        SetSummary set = queries.findSet(row.setId(), activeOnly).orElseThrow().set();
        return new PrintingDetail(printing, card, set, row.metadata());
    }

    /**
     * A printing of an ACTIVE game as a shareable link (Phase 5 messages and posts); empty when the
     * printing does not exist or its game is hidden.
     */
    public Optional<CardLink> cardLink(UUID printingId) {
        Optional<CatalogQueryRepository.PrintingRow> row = queries.findPrinting(printingId, true);
        if (row.isEmpty()) {
            return Optional.empty();
        }
        PrintingSummary printing = queries.withImages(List.of(row.get())).get(0);
        return queries.findCardSummary(row.get().cardId(), true)
                .map(this::summary)
                .map(
                        card ->
                                new CardLink(
                                        printing.id(),
                                        card.id(),
                                        card.name(),
                                        printing.printingCode(),
                                        frontImage(printing)));
    }

    /**
     * Current front image URLs of printings (hidden games included, so shared links keep their
     * picture), by printing id; unknown ids are absent.
     */
    public Map<UUID, String> frontImageUrls(Collection<UUID> printingIds) {
        Map<UUID, String> urls = new LinkedHashMap<>();
        if (printingIds.isEmpty()) {
            return urls;
        }
        for (PrintingSummary printing : queries.printings(printingIds, false)) {
            @Nullable String url = frontImage(printing);
            if (url != null) {
                urls.put(printing.id(), url);
            }
        }
        return urls;
    }

    /**
     * The FRONT image URL of a printing (else its first image), {@code null} without images; the
     * URLs of a {@link PrintingSummary} come from {@code CardImageUrlResolver}.
     */
    public static @Nullable String frontImage(PrintingSummary printing) {
        return printing.images().stream()
                .filter(image -> CatalogImages.KIND_FRONT.equals(image.kind()))
                .findFirst()
                .or(() -> printing.images().stream().findFirst())
                .map(PrintingImage::url)
                .orElse(null);
    }

    /** Printings by id for other modules (Phase 3 inventory); unknown ids are skipped. */
    public List<PrintingSummary> printings(Collection<UUID> ids) {
        return queries.printings(ids);
    }

    /**
     * Printings by id including those of hidden games (an owner's inventory keeps showing cards of
     * a game an admin hid); unknown ids are skipped.
     */
    public List<PrintingSummary> printingsIncludingHidden(Collection<UUID> ids) {
        return queries.printings(ids, false);
    }

    /**
     * Card summaries by id including cards of hidden games (a collector's wishlist keeps showing
     * them), by card id; unknown ids are absent.
     */
    public Map<UUID, CardSummary> cardSummariesIncludingHidden(Collection<UUID> ids) {
        Map<UUID, CardSummary> result = new LinkedHashMap<>();
        for (CardSummary card : queries.findCardSummaries(ids, false)) {
            result.put(card.id(), summary(card));
        }
        return result;
    }

    /** Name of a card for its placeholder image. */
    public Optional<String> cardName(String gameSlug, String cardSlug) {
        return queries.cardName(gameSlug, cardSlug);
    }

    // ---------------------------------------------------------------------------------------
    // Sets
    // ---------------------------------------------------------------------------------------

    /** {@code GET /sets}. */
    public PageResponse<SetSummary> sets(
            @Nullable String gameSlug, @Nullable String query, int page, int size) {
        List<ProblemFieldError> errors = new ArrayList<>();
        @Nullable GameView game = resolveGame(gameSlug, errors);
        if (!errors.isEmpty()) {
            throw ApiException.validation("Validation failed", errors);
        }
        CatalogQueryRepository.Page<SetSummary> result =
                queries.searchSets(game == null ? null : game.id(), blankToNull(query), page, size);
        return PageResponse.of(result.items(), page, size, result.total());
    }

    /** {@code GET /sets/{id}}. */
    public SetDetail set(UUID id, int page, int size) {
        return setDetail(id, true, page, size);
    }

    public SetDetail setDetail(UUID id, boolean activeOnly, int page, int size) {
        CatalogQueryRepository.SetRow set =
                queries.findSet(id, activeOnly)
                        .orElseThrow(() -> ApiException.notFound("Set not found"));
        CatalogQueryRepository.Page<PrintingSummary> printings =
                queries.printingsOfSet(id, page, size);
        return new SetDetail(
                set.set(),
                set.metadata(),
                PageResponse.of(printings.items(), page, size, printings.total()));
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    /** Restricts card metadata to the game's summary fields. */
    CardSummary summary(CardSummary card) {
        List<String> fields =
                gameService
                        .find(card.game())
                        .map(game -> game.schema().summaryFields())
                        .orElse(List.of());
        Map<String, Object> subset = new LinkedHashMap<>();
        for (String field : fields) {
            Object value = card.metadata().get(field);
            if (value != null) {
                subset.put(field, value);
            }
        }
        return new CardSummary(
                card.id(),
                card.game(),
                card.name(),
                card.slug(),
                card.cardType(),
                card.subtype(),
                card.primaryImageUrl(),
                card.printingCount(),
                subset);
    }

    private @Nullable GameView resolveGame(@Nullable String slug, List<ProblemFieldError> errors) {
        if (slug == null || slug.isBlank()) {
            return null;
        }
        Optional<GameView> game =
                gameService.find(slug.trim().toLowerCase(Locale.ROOT)).filter(GameView::isActive);
        if (game.isEmpty()) {
            errors.add(new ProblemFieldError("game", "unknown game"));
            return null;
        }
        return game.get();
    }

    /**
     * JSON object for {@code card.metadata @> ...} from {@code metadata.<key>} parameters, typed by
     * the game's schema; {@code null} without filters.
     */
    @Nullable String metadataFilter(
            @Nullable GameView game,
            Map<String, List<String>> filters,
            List<ProblemFieldError> errors) {
        if (filters.isEmpty()) {
            return null;
        }
        if (game == null) {
            errors.add(new ProblemFieldError("game", "metadata filters need a game"));
            return null;
        }
        Map<String, Object> containment = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> filter : filters.entrySet()) {
            String field = METADATA_PREFIX + filter.getKey();
            Optional<GameSchema.MetadataField> definition = game.schema().field(filter.getKey());
            if (definition.isEmpty() || !definition.get().filterable()) {
                errors.add(new ProblemFieldError(field, "not a filterable field of this game"));
                continue;
            }
            List<String> values =
                    filter.getValue().stream()
                            .filter(v -> v != null && !v.isBlank())
                            .map(String::trim)
                            .toList();
            if (values.isEmpty()) {
                continue;
            }
            GameSchema.MetadataField meta = definition.get();
            switch (meta.type()) {
                case GameSchema.MetadataField.NUMBER -> {
                    try {
                        containment.put(meta.key(), new BigDecimal(values.get(0)));
                    } catch (NumberFormatException e) {
                        errors.add(new ProblemFieldError(field, "must be a number"));
                    }
                }
                case GameSchema.MetadataField.BOOLEAN -> {
                    String value = values.get(0).toLowerCase(Locale.ROOT);
                    if (!value.equals("true") && !value.equals("false")) {
                        errors.add(new ProblemFieldError(field, "must be true or false"));
                    } else {
                        containment.put(meta.key(), Boolean.parseBoolean(value));
                    }
                }
                case GameSchema.MetadataField.STRING_LIST ->
                        containment.put(
                                meta.key(), values.stream().map(v -> canonical(meta, v)).toList());
                default -> containment.put(meta.key(), canonical(meta, values.get(0)));
            }
        }
        return containment.isEmpty() ? null : jsonMapper.writeValueAsString(containment);
    }

    /** The option spelled like {@code value} ignoring case, or {@code value} itself. */
    private static String canonical(GameSchema.MetadataField field, String value) {
        if (field.options() == null) {
            return value;
        }
        return field.options().stream()
                .filter(option -> option.equalsIgnoreCase(value))
                .findFirst()
                .orElse(value);
    }

    private static Optional<UUID> parseUuid(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private static @Nullable String blankToNull(@Nullable String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * Raw filters of {@code GET /cards}.
     *
     * @param game game slug
     * @param query free text or printing code
     * @param set set id or code
     * @param rarity rarity label
     * @param language ISO 639-1 code
     * @param edition edition code
     * @param metadata {@code metadata.<key>} parameters by key (without the prefix)
     * @param page zero-based page
     * @param size page size
     */
    public record CardQuery(
            @Nullable String game,
            @Nullable String query,
            @Nullable String set,
            @Nullable String rarity,
            @Nullable String language,
            @Nullable String edition,
            Map<String, List<String>> metadata,
            int page,
            int size) {}
}
