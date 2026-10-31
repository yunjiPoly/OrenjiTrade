package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CardSearchCriteria;
import com.orenjitrade.api.cards.domain.CardSuggestion;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.MarketPrice;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.cards.domain.SetSummary;
import com.orenjitrade.api.cards.domain.images.CardImageUrlResolver;
import com.orenjitrade.api.cards.domain.images.CardImageUrlResolver.ImageRef;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Read side of the catalog (ADR 0012): card search with PostgreSQL full-text search ({@code
 * websearch_to_tsquery('simple', unaccent(q))}, ranked with {@code ts_rank_cd}) plus a trigram
 * fallback on {@code card.normalized_name} when fewer than {@link #FUZZY_THRESHOLD} rows match,
 * printing-code lookups, sets, printings and autocomplete. Only cards of ACTIVE games are visible.
 * Image URLs come from {@link CardImageUrlResolver} (ADR 0015): printing images, else the card's
 * primary artwork, else the placeholder; provider source URLs of re-host-only providers never leave
 * the server.
 */
@Repository
public class CatalogQueryRepository {

    /** Below this many full-text hits the trigram fallback is added (Phase 2 contract). */
    public static final int FUZZY_THRESHOLD = 5;

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private static final String TSQUERY = "websearch_to_tsquery('simple', unaccent_immutable(:q))";

    private static final String CARD_COLUMNS =
            """
            c.id, g.slug AS game, c.name, c.slug, c.card_type, c.subtype, c.metadata::text AS metadata,
            (SELECT count(*) FROM card_printing pc WHERE pc.card_id = c.id) AS printing_count,
            coalesce((SELECT pi.image_id FROM card_printing pi
                        JOIN card_set si ON si.id = pi.set_id
                       WHERE pi.card_id = c.id AND pi.image_id IS NOT NULL
                       ORDER BY si.release_date NULLS LAST, pi.printing_code NULLS LAST, pi.id
                       LIMIT 1), c.image_id) AS image_id
            """;

    private static final String PRINTING_COLUMNS =
            """
            p.id, p.card_id, p.set_id, s.code AS set_code, s.name AS set_name,
            s.release_date AS set_release_date, p.collector_number,
            p.printing_code, p.rarity, p.edition, p.language, p.finish, p.market_price,
            p.market_price_currency, p.market_price_updated_at,
            p.external_ref ->> 'provider' AS price_provider, p.metadata::text AS metadata,
            g.slug AS game, c.slug AS card_slug,
            coalesce(p.image_id, c.image_id) AS artwork_id
            """;

    private static final String PRINTING_FROM =
            """
             FROM card_printing p
             JOIN card_set s ON s.id = p.set_id
             JOIN card c ON c.id = p.card_id
             JOIN game g ON g.id = c.game_id
            """;

    /**
     * With {@code :whole}, a printing code matched by the prefix {@code :code} must not go on with
     * a digit: the number of {@code :code} is the whole number ({@code ZSK-1} is ZSK-1 or ZSK-1A,
     * never ZSK-100). Used for a number typed with leading zeros once the code as typed found
     * nothing (stage R10, review fix 2).
     */
    static final String WHOLE_NUMBER =
            " AND (NOT :whole OR substring(p.printing_code FROM char_length(:code) + 1 FOR 1)"
                    + " !~ '[0-9]')";

    private static final String PRINTING_ORDER =
            " ORDER BY s.release_date NULLS LAST, s.code, p.collector_number, p.edition,"
                    + " p.language, p.finish, p.id";

    private static final String IMAGE_REF_COLUMNS =
            "id, kind, url, provider, provider_image_id, source_url, cache_status, width, height";

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;
    private final CardImageUrlResolver images;

    public CatalogQueryRepository(
            JdbcClient jdbc, JsonMapper jsonMapper, CardImageUrlResolver images) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
        this.images = images;
    }

    // ---------------------------------------------------------------------------------------
    // Cards
    // ---------------------------------------------------------------------------------------

    /** One page of cards matching {@code criteria} and the total count. */
    public Page<CardSummary> searchCards(CardSearchCriteria criteria) {
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE g.status = 'ACTIVE'");
        if (criteria.gameId() != null) {
            where.append(" AND c.game_id = :gameId");
            params.put("gameId", criteria.gameId());
        }
        if (criteria.hasPrintingFilter()) {
            where.append(
                    " AND EXISTS (SELECT 1 FROM card_printing fp JOIN card_set fs ON fs.id ="
                            + " fp.set_id WHERE fp.card_id = c.id");
            if (criteria.setId() != null) {
                where.append(" AND fs.id = :setId");
                params.put("setId", criteria.setId());
            }
            if (criteria.setCode() != null) {
                where.append(" AND fs.code = :setCode");
                params.put("setCode", criteria.setCode());
            }
            if (criteria.rarity() != null) {
                where.append(" AND lower(fp.rarity) = lower(:rarity)");
                params.put("rarity", criteria.rarity());
            }
            if (criteria.language() != null) {
                where.append(" AND fp.language = :language");
                params.put("language", criteria.language());
            }
            if (criteria.edition() != null) {
                where.append(" AND fp.edition = :edition");
                params.put("edition", criteria.edition());
            }
            where.append(")");
        }
        if (criteria.metadataJson() != null) {
            where.append(" AND c.metadata @> CAST(:metadata AS jsonb)");
            params.put("metadata", criteria.metadataJson());
        }

        String order = " ORDER BY g.sort_order, c.normalized_name, c.id";
        @Nullable String query = criteria.query();
        if (query != null && !query.isBlank()) {
            String normalised = CatalogText.normalise(query);
            String escaped = CatalogText.escapeLike(normalised);
            params.put("q", query);
            params.put("qn", normalised);
            params.put("contains", "%" + escaped + "%");
            params.put("prefix", escaped + "%");
            String textMatch =
                    "(c.search_vector @@ "
                            + TSQUERY
                            + " OR c.normalized_name LIKE :contains ESCAPE '\\')";
            long textHits =
                    count(
                            "FROM card c JOIN game g ON g.id = c.game_id"
                                    + where
                                    + " AND "
                                    + textMatch,
                            params);
            if (textHits < FUZZY_THRESHOLD) {
                where.append(" AND (")
                        .append(textMatch)
                        .append(" OR c.normalized_name % :qn OR :qn <% c.normalized_name)");
            } else {
                where.append(" AND ").append(textMatch);
            }
            order =
                    " ORDER BY CASE WHEN c.normalized_name = :qn THEN 0"
                            + " WHEN c.normalized_name LIKE :prefix ESCAPE '\\' THEN 1"
                            + " WHEN c.search_vector @@ "
                            + TSQUERY
                            + " THEN 2"
                            + " WHEN c.normalized_name LIKE :contains ESCAPE '\\' THEN 3"
                            + " ELSE 4 END,"
                            + " ts_rank_cd(c.search_vector, "
                            + TSQUERY
                            + ") DESC,"
                            + " greatest(similarity(c.normalized_name, :qn),"
                            + " word_similarity(:qn, c.normalized_name)) DESC,"
                            + " c.normalized_name, c.id";
        }
        String from = "FROM card c JOIN game g ON g.id = c.game_id" + where;
        long total = count(from, params);
        if (total == 0) {
            return new Page<>(List.of(), 0);
        }
        params.put("limit", criteria.size());
        params.put("offset", (long) criteria.page() * criteria.size());
        List<CardRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + CARD_COLUMNS
                                        + " "
                                        + from
                                        + order
                                        + " LIMIT :limit OFFSET :offset")
                        .params(params)
                        .query(this::mapCard)
                        .list();
        return new Page<>(summaries(rows), total);
    }

    /** The card holding the printing {@code code} (upper-case) in an ACTIVE game. */
    public Optional<UUID> cardIdByPrintingCode(String code, @Nullable UUID gameId) {
        return jdbc.sql(
                        """
                        SELECT p.card_id FROM card_printing p
                          JOIN card c ON c.id = p.card_id
                          JOIN game g ON g.id = c.game_id
                         WHERE p.printing_code = :code AND g.status = 'ACTIVE'
                           AND (CAST(:gameId AS uuid) IS NULL OR c.game_id = CAST(:gameId AS uuid))
                         ORDER BY p.id
                         LIMIT 1
                        """)
                .param("code", code)
                .param("gameId", gameId, java.sql.Types.OTHER)
                .query(UUID.class)
                .optional();
    }

    /**
     * Every printing carrying the exact code {@code code} (upper-case) in ACTIVE games, as {@code
     * [printingId, cardId]} pairs (unified search resolution).
     */
    public List<UUID[]> printingsByCode(String code, @Nullable UUID gameId) {
        return jdbc.sql(
                        """
                        SELECT p.id, p.card_id FROM card_printing p
                          JOIN card c ON c.id = p.card_id
                          JOIN game g ON g.id = c.game_id
                         WHERE p.printing_code = :code AND g.status = 'ACTIVE'
                           AND (CAST(:gameId AS uuid) IS NULL OR c.game_id = CAST(:gameId AS uuid))
                         ORDER BY p.id
                         LIMIT 50
                        """)
                .param("code", code)
                .param("gameId", gameId, java.sql.Types.OTHER)
                .query(
                        (rs, rowNum) ->
                                new UUID[] {
                                    rs.getObject("id", UUID.class),
                                    rs.getObject("card_id", UUID.class)
                                })
                .list();
    }

    /**
     * Cards of ACTIVE games whose normalised name equals {@code normalised} (at most {@code
     * limit}).
     */
    public List<UUID> cardIdsByExactName(String normalised, @Nullable UUID gameId, int limit) {
        return jdbc.sql(
                        """
                        SELECT c.id FROM card c JOIN game g ON g.id = c.game_id
                         WHERE c.normalized_name = :qn AND g.status = 'ACTIVE'
                           AND (CAST(:gameId AS uuid) IS NULL OR c.game_id = CAST(:gameId AS uuid))
                         ORDER BY c.id
                         LIMIT :limit
                        """)
                .param("qn", normalised)
                .param("gameId", gameId, java.sql.Types.OTHER)
                .param("limit", limit)
                .query(UUID.class)
                .list();
    }

    /**
     * Printings of ACTIVE games whose code starts with {@code prefix} (upper-case); with {@code
     * wholeNumber}, only those whose code does not go on with a digit after it ({@code ZTK-12}
     * finds ZTK-12 and ZTK-12P, never ZTK-120: {@link #WHOLE_NUMBER}).
     */
    public List<PrintingSummary> printingsByCodePrefix(
            String prefix, boolean wholeNumber, @Nullable UUID gameId, int limit) {
        List<PrintingRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + PRINTING_COLUMNS
                                        + PRINTING_FROM
                                        + " WHERE g.status = 'ACTIVE'"
                                        + " AND p.printing_code LIKE :prefix ESCAPE '\\'"
                                        + WHOLE_NUMBER
                                        + " AND (CAST(:gameId AS uuid) IS NULL"
                                        + " OR c.game_id = CAST(:gameId AS uuid))"
                                        + " ORDER BY p.printing_code, p.edition, p.language,"
                                        + " p.finish, p.id LIMIT :limit")
                        .param("prefix", CatalogText.escapeLike(prefix) + "%")
                        .param("code", prefix)
                        .param("whole", wholeNumber)
                        .param("gameId", gameId, java.sql.Types.OTHER)
                        .param("limit", limit)
                        .query(this::mapPrinting)
                        .list();
        return withImages(rows);
    }

    /** Summary of one card (of an ACTIVE game unless {@code activeOnly} is false). */
    public Optional<CardSummary> findCardSummary(UUID id, boolean activeOnly) {
        return jdbc.sql(
                        "SELECT "
                                + CARD_COLUMNS
                                + " FROM card c JOIN game g ON g.id = c.game_id"
                                + " WHERE c.id = :id AND (g.status = 'ACTIVE' OR NOT :activeOnly)")
                .param("id", id)
                .param("activeOnly", activeOnly)
                .query(this::mapCard)
                .optional()
                .map(row -> summaries(List.of(row)).get(0));
    }

    /** Summaries of several cards (of ACTIVE games unless {@code activeOnly} is false). */
    public List<CardSummary> findCardSummaries(Collection<UUID> ids, boolean activeOnly) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return summaries(
                jdbc.sql(
                                "SELECT "
                                        + CARD_COLUMNS
                                        + " FROM card c JOIN game g ON g.id = c.game_id"
                                        + " WHERE c.id IN (:ids) AND (g.status = 'ACTIVE' OR NOT"
                                        + " :activeOnly)")
                        .param("ids", ids)
                        .param("activeOnly", activeOnly)
                        .query(this::mapCard)
                        .list());
    }

    /** Rules text of a card. */
    public String cardText(UUID id) {
        return jdbc.sql("SELECT text FROM card WHERE id = :id")
                .param("id", id)
                .query(String.class)
                .optional()
                .orElse("");
    }

    /** Name of the card {@code cardSlug} of the ACTIVE game {@code gameSlug} (placeholders). */
    public Optional<String> cardName(String gameSlug, String cardSlug) {
        return jdbc.sql(
                        """
                        SELECT c.name FROM card c JOIN game g ON g.id = c.game_id
                         WHERE g.slug = :game AND c.slug = :slug AND g.status = 'ACTIVE'
                        """)
                .param("game", gameSlug)
                .param("slug", cardSlug)
                .query(String.class)
                .optional();
    }

    // ---------------------------------------------------------------------------------------
    // Printings
    // ---------------------------------------------------------------------------------------

    public List<PrintingSummary> printingsOfCard(UUID cardId, boolean activeOnly) {
        List<PrintingRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + PRINTING_COLUMNS
                                        + PRINTING_FROM
                                        + " WHERE p.card_id = :cardId"
                                        + " AND (g.status = 'ACTIVE' OR NOT :activeOnly)"
                                        + PRINTING_ORDER)
                        .param("cardId", cardId)
                        .param("activeOnly", activeOnly)
                        .query(this::mapPrinting)
                        .list();
        return withImages(rows);
    }

    public Page<PrintingSummary> printingsOfSet(UUID setId, int page, int size) {
        long total =
                jdbc.sql("SELECT count(*) FROM card_printing WHERE set_id = :setId")
                        .param("setId", setId)
                        .query(Long.class)
                        .single();
        List<PrintingRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + PRINTING_COLUMNS
                                        + PRINTING_FROM
                                        + " WHERE p.set_id = :setId"
                                        + " ORDER BY p.collector_number, p.edition, p.language,"
                                        + " p.finish, p.id LIMIT :limit OFFSET :offset")
                        .param("setId", setId)
                        .param("limit", size)
                        .param("offset", (long) page * size)
                        .query(this::mapPrinting)
                        .list();
        return new Page<>(withImages(rows), total);
    }

    /** Printings by id (other modules, Phase 3 inventory), in ACTIVE games only. */
    public List<PrintingSummary> printings(Collection<UUID> ids) {
        return printings(ids, true);
    }

    /** Printings by id; {@code activeOnly=false} includes printings of hidden games. */
    public List<PrintingSummary> printings(Collection<UUID> ids, boolean activeOnly) {
        if (ids.isEmpty()) {
            return List.of();
        }
        List<PrintingRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + PRINTING_COLUMNS
                                        + PRINTING_FROM
                                        + " WHERE p.id IN (:ids)"
                                        + " AND (g.status = 'ACTIVE' OR NOT :activeOnly)"
                                        + PRINTING_ORDER)
                        .param("ids", ids)
                        .param("activeOnly", activeOnly)
                        .query(this::mapPrinting)
                        .list();
        return withImages(rows);
    }

    /** One printing with the ids of its card and set and its metadata. */
    public Optional<PrintingRow> findPrinting(UUID id, boolean activeOnly) {
        return jdbc.sql(
                        "SELECT "
                                + PRINTING_COLUMNS
                                + PRINTING_FROM
                                + " WHERE p.id = :id AND (g.status = 'ACTIVE' OR NOT :activeOnly)")
                .param("id", id)
                .param("activeOnly", activeOnly)
                .query(this::mapPrinting)
                .optional();
    }

    /**
     * Adds images to printing rows: the printing's own images (placeholders), else its own provider
     * artwork ({@code card_printing.image_id}: Magic and Pokémon), else the card's primary artwork,
     * else the placeholder.
     */
    public List<PrintingSummary> withImages(List<PrintingRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<ImageRef>> own = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT printing_id, "
                                + IMAGE_REF_COLUMNS
                                + " FROM card_image WHERE printing_id IN (:ids) ORDER BY CASE kind"
                                + " WHEN 'FRONT' THEN 0 WHEN 'BACK' THEN 1 ELSE 2 END, position,"
                                + " id")
                .param("ids", rows.stream().map(PrintingRow::id).distinct().toList())
                .query(
                        rs -> {
                            own.computeIfAbsent(
                                            rs.getObject("printing_id", UUID.class),
                                            id -> new ArrayList<>())
                                    .add(imageRef(rs));
                        });
        Map<UUID, ImageRef> cardImages =
                imageRefs(
                        rows.stream()
                                .filter(row -> !own.containsKey(row.id()))
                                .map(PrintingRow::artworkId)
                                .filter(Objects::nonNull)
                                .toList());
        return rows.stream()
                .map(
                        row -> {
                            List<ImageRef> refs = own.get(row.id());
                            List<PrintingImage> printingImages;
                            if (refs != null && !refs.isEmpty()) {
                                printingImages =
                                        refs.stream()
                                                .map(
                                                        ref ->
                                                                images.printingImage(
                                                                        ref,
                                                                        row.game(),
                                                                        row.cardSlug()))
                                                .toList();
                            } else {
                                @Nullable ImageRef card =
                                        row.artworkId() == null
                                                ? null
                                                : cardImages.get(row.artworkId());
                                printingImages =
                                        List.of(
                                                images.printingImage(
                                                        card, row.game(), row.cardSlug()));
                            }
                            return row.toSummary(printingImages);
                        })
                .toList();
    }

    /** Image rows by id (resolver input). */
    public Map<UUID, ImageRef> imageRefs(Collection<UUID> ids) {
        Map<UUID, ImageRef> refs = new HashMap<>();
        if (ids.isEmpty()) {
            return refs;
        }
        List<UUID> distinct = ids.stream().distinct().toList();
        for (int from = 0; from < distinct.size(); from += 1000) {
            jdbc.sql("SELECT " + IMAGE_REF_COLUMNS + " FROM card_image WHERE id IN (:ids)")
                    .param("ids", distinct.subList(from, Math.min(distinct.size(), from + 1000)))
                    .query(
                            rs -> {
                                ImageRef ref = imageRef(rs);
                                refs.put(ref.id(), ref);
                            });
        }
        return refs;
    }

    private static ImageRef imageRef(ResultSet rs) throws SQLException {
        return new ImageRef(
                rs.getObject("id", UUID.class),
                rs.getString("kind"),
                rs.getString("url"),
                rs.getString("provider"),
                rs.getString("provider_image_id"),
                rs.getString("source_url"),
                rs.getString("cache_status"),
                nullableInt(rs, "width"),
                nullableInt(rs, "height"));
    }

    /** Client URL of an image id (or the placeholder). */
    private String imageUrl(
            @Nullable UUID imageId, Map<UUID, ImageRef> refs, String game, String cardSlug) {
        return images.url(imageId == null ? null : refs.get(imageId), game, cardSlug);
    }

    private List<CardSuggestion> suggestions(List<SuggestionRow> rows) {
        Map<UUID, ImageRef> refs =
                imageRefs(
                        rows.stream()
                                .map(SuggestionRow::imageId)
                                .filter(Objects::nonNull)
                                .toList());
        return rows.stream()
                .map(
                        row -> {
                            CardSuggestion suggestion = row.suggestion();
                            return new CardSuggestion(
                                    suggestion.kind(),
                                    suggestion.id(),
                                    suggestion.printingId(),
                                    suggestion.name(),
                                    suggestion.game(),
                                    suggestion.setCode(),
                                    suggestion.printingCode(),
                                    imageUrl(
                                            row.imageId(), refs, suggestion.game(), row.cardSlug()),
                                    suggestion.setName(),
                                    suggestion.rarity(),
                                    suggestion.printingCount(),
                                    suggestion.edition(),
                                    suggestion.language(),
                                    suggestion.finish());
                        })
                .toList();
    }

    /** A suggestion before its image URL is resolved. */
    private record SuggestionRow(
            CardSuggestion suggestion, String cardSlug, @Nullable UUID imageId) {}

    /**
     * Printing codes starting with {@code prefix} (autocomplete); with {@code wholeNumber}, only
     * those that do not go on with a digit after it ({@link #WHOLE_NUMBER}).
     */
    public List<CardSuggestion> suggestPrintings(
            @Nullable UUID gameId, String prefix, boolean wholeNumber, int limit) {
        return jdbc
                .sql(
                        """
                        SELECT p.id AS printing_id, c.id AS card_id, c.name, c.slug AS card_slug,
                               g.slug AS game, s.code AS set_code, s.name AS set_name,
                               p.printing_code, p.rarity, p.edition, p.language, p.finish,
                               coalesce(p.image_id, c.image_id) AS image_id
                          FROM card_printing p
                          JOIN card c ON c.id = p.card_id
                          JOIN game g ON g.id = c.game_id
                          JOIN card_set s ON s.id = p.set_id
                         WHERE g.status = 'ACTIVE' AND p.printing_code LIKE :prefix ESCAPE '\\'
                        """
                                + WHOLE_NUMBER
                                + """
                                   AND (CAST(:gameId AS uuid) IS NULL OR c.game_id = CAST(:gameId AS uuid))
                                 ORDER BY p.printing_code, p.edition, p.language, p.finish, p.id
                                 LIMIT :limit
                                """)
                .param("prefix", CatalogText.escapeLike(prefix) + "%")
                .param("code", prefix)
                .param("whole", wholeNumber)
                .param("gameId", gameId, java.sql.Types.OTHER)
                .param("limit", limit)
                .query(
                        (rs, rowNum) ->
                                new SuggestionRow(
                                        new CardSuggestion(
                                                CardSuggestion.PRINTING,
                                                rs.getObject("card_id", UUID.class),
                                                rs.getObject("printing_id", UUID.class),
                                                rs.getString("name"),
                                                rs.getString("game"),
                                                rs.getString("set_code"),
                                                rs.getString("printing_code"),
                                                null,
                                                rs.getString("set_name"),
                                                rs.getString("rarity"),
                                                null,
                                                rs.getString("edition"),
                                                rs.getString("language"),
                                                rs.getString("finish")),
                                        rs.getString("card_slug"),
                                        rs.getObject("image_id", UUID.class)))
                .list()
                .stream()
                .collect(Collectors.collectingAndThen(Collectors.toList(), this::suggestions));
    }

    /** Cards whose name starts with, contains, full-text matches or resembles {@code query}. */
    public List<CardSuggestion> suggestCards(@Nullable UUID gameId, String query, int limit) {
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        return jdbc
                .sql(
                        """
                        SELECT c.id, c.name, c.slug, g.slug AS game,
                               pp.set_code, pp.printing_code,
                               coalesce(pp.image_id, c.image_id) AS image_id,
                               (SELECT count(*) FROM card_printing pc WHERE pc.card_id = c.id)
                                   AS printing_count
                          FROM card c
                          JOIN game g ON g.id = c.game_id
                          LEFT JOIN LATERAL (
                                SELECT s.code AS set_code, p.printing_code, p.image_id
                                  FROM card_printing p
                                  JOIN card_set s ON s.id = p.set_id
                                 WHERE p.card_id = c.id
                                 ORDER BY s.release_date NULLS LAST, p.printing_code NULLS LAST, p.id
                                 LIMIT 1) pp ON true
                         WHERE g.status = 'ACTIVE'
                           AND (CAST(:gameId AS uuid) IS NULL OR c.game_id = CAST(:gameId AS uuid))
                           AND (c.normalized_name LIKE :contains ESCAPE '\\'
                                OR c.search_vector @@ websearch_to_tsquery('simple', unaccent_immutable(:q))
                                OR c.normalized_name % :qn OR :qn <% c.normalized_name)
                         ORDER BY CASE WHEN c.normalized_name LIKE :prefix ESCAPE '\\' THEN 0
                                       WHEN c.normalized_name LIKE :contains ESCAPE '\\' THEN 1
                                       ELSE 2 END,
                                  greatest(similarity(c.normalized_name, :qn),
                                           word_similarity(:qn, c.normalized_name)) DESC,
                                  c.normalized_name, c.id
                         LIMIT :limit
                        """)
                .param("gameId", gameId, java.sql.Types.OTHER)
                .param("q", query)
                .param("qn", normalised)
                .param("contains", "%" + escaped + "%")
                .param("prefix", escaped + "%")
                .param("limit", limit)
                .query(
                        (rs, rowNum) ->
                                new SuggestionRow(
                                        new CardSuggestion(
                                                CardSuggestion.CARD,
                                                rs.getObject("id", UUID.class),
                                                null,
                                                rs.getString("name"),
                                                rs.getString("game"),
                                                rs.getString("set_code"),
                                                rs.getString("printing_code"),
                                                null,
                                                null,
                                                null,
                                                rs.getInt("printing_count"),
                                                null,
                                                null,
                                                null),
                                        rs.getString("slug"),
                                        rs.getObject("image_id", UUID.class)))
                .list()
                .stream()
                .collect(Collectors.collectingAndThen(Collectors.toList(), this::suggestions));
    }

    // ---------------------------------------------------------------------------------------
    // Sets
    // ---------------------------------------------------------------------------------------

    private static final String SET_COLUMNS =
            """
            s.id, g.slug AS game, s.code, s.name, s.release_date, s.total_cards, s.series,
            s.metadata::text AS metadata,
            (SELECT count(*) FROM card_printing p WHERE p.set_id = s.id) AS printing_count
            """;

    public Page<SetSummary> searchSets(
            @Nullable UUID gameId, @Nullable String query, int page, int size) {
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE g.status = 'ACTIVE'");
        if (gameId != null) {
            where.append(" AND s.game_id = :gameId");
            params.put("gameId", gameId);
        }
        String order = " ORDER BY s.release_date DESC NULLS LAST, s.name, s.id";
        if (query != null && !query.isBlank()) {
            String normalised = CatalogText.normalise(query);
            params.put("q", query);
            params.put("qn", normalised);
            params.put("code", query.trim().toUpperCase(java.util.Locale.ROOT));
            params.put("contains", "%" + CatalogText.escapeLike(normalised) + "%");
            where.append(
                    " AND (s.code = :code OR s.search_vector @@ "
                            + TSQUERY
                            + " OR lower(unaccent_immutable(s.name)) LIKE :contains ESCAPE '\\'"
                            + " OR lower(unaccent_immutable(s.name)) % :qn)");
            order =
                    " ORDER BY CASE WHEN s.code = :code THEN 0 ELSE 1 END,"
                            + " similarity(lower(unaccent_immutable(s.name)), :qn) DESC,"
                            + " s.release_date DESC NULLS LAST, s.name, s.id";
        }
        String from = "FROM card_set s JOIN game g ON g.id = s.game_id" + where;
        long total = count(from, params);
        if (total == 0) {
            return new Page<>(List.of(), 0);
        }
        params.put("limit", size);
        params.put("offset", (long) page * size);
        List<SetSummary> items =
                jdbc.sql(
                                "SELECT "
                                        + SET_COLUMNS
                                        + " "
                                        + from
                                        + order
                                        + " LIMIT :limit OFFSET :offset")
                        .params(params)
                        .query((rs, rowNum) -> mapSet(rs))
                        .list();
        return new Page<>(items, total);
    }

    /** A set (of an ACTIVE game unless {@code activeOnly} is false) with its metadata. */
    public Optional<SetRow> findSet(UUID id, boolean activeOnly) {
        return jdbc.sql(
                        "SELECT "
                                + SET_COLUMNS
                                + " FROM card_set s JOIN game g ON g.id = s.game_id"
                                + " WHERE s.id = :id AND (g.status = 'ACTIVE' OR NOT :activeOnly)")
                .param("id", id)
                .param("activeOnly", activeOnly)
                .query((rs, rowNum) -> new SetRow(mapSet(rs), readMap(rs.getString("metadata"))))
                .optional();
    }

    /** Set ids by code within a game or across games ({@code set=} filter). */
    public List<UUID> setIdsByCode(String code, @Nullable UUID gameId) {
        return jdbc.sql(
                        """
                        SELECT id FROM card_set WHERE code = :code
                           AND (CAST(:gameId AS uuid) IS NULL OR game_id = CAST(:gameId AS uuid))
                        """)
                .param("code", code)
                .param("gameId", gameId, java.sql.Types.OTHER)
                .query(UUID.class)
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Grouped lookups (inventory import: one query per batch of file rows, never one per row)
    // ---------------------------------------------------------------------------------------

    /** Rows of one {@code IN (...)} list (far below the 65 535 parameters of a statement). */
    static final int LOOKUP_BATCH = 1000;

    private static final String REF_COLUMNS =
            """
            p.id, p.card_id, g.slug AS game, s.code AS set_code, s.name AS set_name,
            s.release_date, p.collector_number, p.printing_code, p.rarity, p.edition, p.language,
            p.finish
            """;

    /**
     * Cards of ACTIVE games whose provider identity ({@code external_ref}) is one of {@code
     * externalIds}, by that id (index {@code uq_card_external_ref}).
     */
    public Map<String, CatalogCardRef> cardsByExternalIds(
            String provider, Collection<String> externalIds) {
        Map<String, CatalogCardRef> result = new LinkedHashMap<>();
        for (List<String> batch : batches(externalIds)) {
            jdbc.sql(
                            """
                            SELECT c.id, g.slug AS game, c.name, c.external_ref ->> 'id' AS ref
                              FROM card c JOIN game g ON g.id = c.game_id
                             WHERE c.external_ref ->> 'provider' = :provider
                               AND c.external_ref ->> 'id' IN (:ids) AND g.status = 'ACTIVE'
                            """)
                    .param("provider", provider)
                    .param("ids", batch)
                    .query(
                            rs -> {
                                result.put(rs.getString("ref"), cardRef(rs));
                            });
        }
        return result;
    }

    /**
     * Cards of ACTIVE games that own the provider artwork {@code provider_image_id}, by that id
     * (index {@code uq_card_image_provider}): an alternate artwork has its own id at the provider.
     */
    public Map<String, CatalogCardRef> cardsByProviderImageIds(
            String provider, Collection<String> imageIds) {
        Map<String, CatalogCardRef> result = new LinkedHashMap<>();
        for (List<String> batch : batches(imageIds)) {
            jdbc.sql(
                            """
                            SELECT c.id, g.slug AS game, c.name, i.provider_image_id AS ref
                              FROM card_image i
                              JOIN card c ON c.id = i.card_id
                              JOIN game g ON g.id = c.game_id
                             WHERE i.provider = :provider AND i.provider_image_id IN (:ids)
                               AND g.status = 'ACTIVE'
                            """)
                    .param("provider", provider)
                    .param("ids", batch)
                    .query(
                            rs -> {
                                result.put(rs.getString("ref"), cardRef(rs));
                            });
        }
        return result;
    }

    /**
     * Cards of the given (ACTIVE) games by normalised name ({@code card.normalized_name}, index
     * {@code ix_card_game_name}); a name can belong to several cards (one per game, or reprints an
     * admin entered twice).
     */
    public Map<String, List<CatalogCardRef>> cardsByNormalisedNames(
            Collection<UUID> gameIds, Collection<String> names) {
        Map<String, List<CatalogCardRef>> result = new LinkedHashMap<>();
        if (gameIds.isEmpty()) {
            return result;
        }
        for (List<String> batch : batches(names)) {
            jdbc.sql(
                            """
                            SELECT c.id, g.slug AS game, c.name, c.normalized_name
                              FROM card c JOIN game g ON g.id = c.game_id
                             WHERE c.game_id IN (:gameIds) AND c.normalized_name IN (:names)
                               AND g.status = 'ACTIVE'
                             ORDER BY g.sort_order, c.id
                            """)
                    .param("gameIds", gameIds)
                    .param("names", batch)
                    .query(
                            rs -> {
                                result.computeIfAbsent(
                                                rs.getString("normalized_name"),
                                                name -> new ArrayList<>())
                                        .add(cardRef(rs));
                            });
        }
        return result;
    }

    /**
     * Printings of ACTIVE games of the given cards, by card: the most recent set first (release
     * date, unknown dates last), then code and id, so the first of a list is "the most recent
     * printing" and the order never changes between two calls.
     */
    public Map<UUID, List<CatalogPrintingRef>> printingRefsOfCards(Collection<UUID> cardIds) {
        Map<UUID, List<CatalogPrintingRef>> result = new LinkedHashMap<>();
        for (List<UUID> batch : batches(cardIds)) {
            jdbc.sql(
                            "SELECT "
                                    + REF_COLUMNS
                                    + PRINTING_FROM
                                    + " WHERE p.card_id IN (:ids) AND g.status = 'ACTIVE'"
                                    + " ORDER BY p.card_id, s.release_date DESC NULLS LAST,"
                                    + " p.printing_code NULLS LAST, p.collector_number, p.edition,"
                                    + " p.language, p.finish, p.id")
                    .param("ids", batch)
                    .query(
                            rs -> {
                                CatalogPrintingRef ref = printingRef(rs);
                                result.computeIfAbsent(ref.cardId(), id -> new ArrayList<>())
                                        .add(ref);
                            });
        }
        return result;
    }

    /** Printings of ACTIVE games by exact printing code (upper-case), by code. */
    public Map<String, List<CatalogPrintingRef>> printingRefsByCodes(Collection<String> codes) {
        Map<String, List<CatalogPrintingRef>> result = new LinkedHashMap<>();
        for (List<String> batch : batches(codes)) {
            jdbc.sql(
                            "SELECT "
                                    + REF_COLUMNS
                                    + PRINTING_FROM
                                    + " WHERE p.printing_code IN (:codes) AND g.status = 'ACTIVE'"
                                    + " ORDER BY p.printing_code, s.release_date DESC NULLS LAST,"
                                    + " p.id")
                    .param("codes", batch)
                    .query(
                            rs -> {
                                CatalogPrintingRef ref = printingRef(rs);
                                result.computeIfAbsent(
                                                Objects.requireNonNull(ref.printingCode()),
                                                code -> new ArrayList<>())
                                        .add(ref);
                            });
        }
        return result;
    }

    /** Printings of ACTIVE games by id; unknown ids and hidden games are absent. */
    public Map<UUID, CatalogPrintingRef> printingRefs(Collection<UUID> ids) {
        Map<UUID, CatalogPrintingRef> result = new LinkedHashMap<>();
        for (List<UUID> batch : batches(ids)) {
            jdbc.sql(
                            "SELECT "
                                    + REF_COLUMNS
                                    + PRINTING_FROM
                                    + " WHERE p.id IN (:ids) AND g.status = 'ACTIVE'")
                    .param("ids", batch)
                    .query(
                            rs -> {
                                CatalogPrintingRef ref = printingRef(rs);
                                result.put(ref.id(), ref);
                            });
        }
        return result;
    }

    private static <T> List<List<T>> batches(Collection<T> values) {
        List<T> distinct = values.stream().filter(Objects::nonNull).distinct().toList();
        List<List<T>> batches = new ArrayList<>();
        for (int from = 0; from < distinct.size(); from += LOOKUP_BATCH) {
            batches.add(distinct.subList(from, Math.min(distinct.size(), from + LOOKUP_BATCH)));
        }
        return batches;
    }

    private static CatalogCardRef cardRef(ResultSet rs) throws SQLException {
        return new CatalogCardRef(
                rs.getObject("id", UUID.class), rs.getString("game"), rs.getString("name"));
    }

    private static CatalogPrintingRef printingRef(ResultSet rs) throws SQLException {
        Date release = rs.getDate("release_date");
        return new CatalogPrintingRef(
                rs.getObject("id", UUID.class),
                rs.getObject("card_id", UUID.class),
                rs.getString("game"),
                rs.getString("set_code"),
                rs.getString("set_name"),
                release == null ? null : release.toLocalDate(),
                rs.getString("collector_number"),
                rs.getString("printing_code"),
                rs.getString("rarity"),
                rs.getString("edition"),
                rs.getString("language"),
                rs.getString("finish"));
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    private long count(String from, Map<String, Object> params) {
        return jdbc.sql("SELECT count(*) " + from).params(params).query(Long.class).single();
    }

    private CardRow mapCard(ResultSet rs, int rowNum) throws SQLException {
        return new CardRow(
                rs.getObject("id", UUID.class),
                rs.getString("game"),
                rs.getString("name"),
                rs.getString("slug"),
                rs.getString("card_type"),
                rs.getString("subtype"),
                rs.getObject("image_id", UUID.class),
                rs.getInt("printing_count"),
                readMap(rs.getString("metadata")));
    }

    /** Card rows with their image URLs resolved in one query. */
    private List<CardSummary> summaries(List<CardRow> rows) {
        Map<UUID, ImageRef> refs =
                imageRefs(rows.stream().map(CardRow::imageId).filter(Objects::nonNull).toList());
        return rows.stream()
                .map(
                        row ->
                                new CardSummary(
                                        row.id(),
                                        row.game(),
                                        row.name(),
                                        row.slug(),
                                        row.cardType(),
                                        row.subtype(),
                                        imageUrl(row.imageId(), refs, row.game(), row.slug()),
                                        row.printingCount(),
                                        row.metadata()))
                .toList();
    }

    /** A card row before its image URL is resolved. */
    private record CardRow(
            UUID id,
            String game,
            String name,
            String slug,
            @Nullable String cardType,
            @Nullable String subtype,
            @Nullable UUID imageId,
            int printingCount,
            Map<String, Object> metadata) {}

    private PrintingRow mapPrinting(ResultSet rs, int rowNum) throws SQLException {
        @Nullable MarketPrice price = null;
        if (rs.getBigDecimal("market_price") != null) {
            Timestamp updated = rs.getTimestamp("market_price_updated_at");
            price =
                    new MarketPrice(
                            rs.getBigDecimal("market_price"),
                            rs.getString("market_price_currency"),
                            updated == null ? null : updated.toInstant(),
                            MarketPrice.sourceOf(rs.getString("price_provider")));
        }
        return new PrintingRow(
                rs.getObject("id", UUID.class),
                rs.getObject("card_id", UUID.class),
                rs.getObject("set_id", UUID.class),
                rs.getString("set_code"),
                rs.getString("set_name"),
                localDate(rs.getDate("set_release_date")),
                rs.getString("collector_number"),
                rs.getString("printing_code"),
                rs.getString("rarity"),
                rs.getString("edition"),
                rs.getString("language"),
                rs.getString("finish"),
                price,
                readMap(rs.getString("metadata")),
                rs.getString("game"),
                rs.getString("card_slug"),
                rs.getObject("artwork_id", UUID.class));
    }

    private static @Nullable LocalDate localDate(@Nullable Date date) {
        return date == null ? null : date.toLocalDate();
    }

    private SetSummary mapSet(ResultSet rs) throws SQLException {
        Date release = rs.getDate("release_date");
        return new SetSummary(
                rs.getObject("id", UUID.class),
                rs.getString("game"),
                rs.getString("code"),
                rs.getString("name"),
                release == null ? null : release.toLocalDate(),
                nullableInt(rs, "total_cards"),
                rs.getString("series"),
                rs.getInt("printing_count"));
    }

    Map<String, Object> readMap(@Nullable String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        return jsonMapper.readValue(json, MAP);
    }

    private static @Nullable Integer nullableInt(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    /**
     * A page of results.
     *
     * @param items the page
     * @param total total matching rows
     */
    public record Page<T>(List<T> items, long total) {}

    /** A set with its metadata. */
    public record SetRow(SetSummary set, Map<String, Object> metadata) {}

    /** A printing row before images are attached. */
    public record PrintingRow(
            UUID id,
            UUID cardId,
            UUID setId,
            String setCode,
            String setName,
            @Nullable LocalDate setReleaseDate,
            String collectorNumber,
            @Nullable String printingCode,
            @Nullable String rarity,
            String edition,
            String language,
            String finish,
            @Nullable MarketPrice marketPrice,
            Map<String, Object> metadata,
            String game,
            String cardSlug,
            @Nullable UUID artworkId) {

        PrintingSummary toSummary(List<PrintingImage> images) {
            return new PrintingSummary(
                    id,
                    cardId,
                    setId,
                    setCode,
                    setName,
                    collectorNumber,
                    printingCode,
                    rarity,
                    edition,
                    language,
                    finish,
                    images,
                    marketPrice,
                    setReleaseDate);
        }
    }
}
