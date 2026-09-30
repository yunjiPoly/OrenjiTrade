package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CardSearchCriteria;
import com.orenjitrade.api.cards.domain.CardSuggestion;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogImages;
import com.orenjitrade.api.cards.domain.CatalogText;
import com.orenjitrade.api.cards.domain.MarketPrice;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.cards.domain.SetSummary;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
 * Image URLs are resolved against the request origin; printings without images get the placeholder.
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
            (SELECT i.url FROM card_printing pi
               JOIN card_set si ON si.id = pi.set_id
               JOIN card_image i ON i.id = pi.image_id
              WHERE pi.card_id = c.id
              ORDER BY si.release_date NULLS LAST, pi.printing_code NULLS LAST, pi.id
              LIMIT 1) AS image_url
            """;

    private static final String PRINTING_COLUMNS =
            """
            p.id, p.card_id, p.set_id, s.code AS set_code, s.name AS set_name, p.collector_number,
            p.printing_code, p.rarity, p.edition, p.language, p.finish, p.market_price,
            p.market_price_currency, p.market_price_updated_at, p.metadata::text AS metadata,
            g.slug AS game, c.slug AS card_slug
            """;

    private static final String PRINTING_FROM =
            """
             FROM card_printing p
             JOIN card_set s ON s.id = p.set_id
             JOIN card c ON c.id = p.card_id
             JOIN game g ON g.id = c.game_id
            """;

    private static final String PRINTING_ORDER =
            " ORDER BY s.release_date NULLS LAST, s.code, p.collector_number, p.edition,"
                    + " p.language, p.finish, p.id";

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;

    public CatalogQueryRepository(JdbcClient jdbc, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
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
        List<CardSummary> items =
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
        return new Page<>(items, total);
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

    /** Printings of ACTIVE games whose code starts with {@code prefix} (upper-case). */
    public List<PrintingSummary> printingsByCodePrefix(
            String prefix, @Nullable UUID gameId, int limit) {
        List<PrintingRow> rows =
                jdbc.sql(
                                "SELECT "
                                        + PRINTING_COLUMNS
                                        + PRINTING_FROM
                                        + " WHERE g.status = 'ACTIVE'"
                                        + " AND p.printing_code LIKE :prefix ESCAPE '\\'"
                                        + " AND (CAST(:gameId AS uuid) IS NULL"
                                        + " OR c.game_id = CAST(:gameId AS uuid))"
                                        + " ORDER BY p.printing_code, p.edition, p.language,"
                                        + " p.finish, p.id LIMIT :limit")
                        .param("prefix", CatalogText.escapeLike(prefix) + "%")
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
                .optional();
    }

    /** Summaries of several cards (of ACTIVE games unless {@code activeOnly} is false). */
    public List<CardSummary> findCardSummaries(Collection<UUID> ids, boolean activeOnly) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        "SELECT "
                                + CARD_COLUMNS
                                + " FROM card c JOIN game g ON g.id = c.game_id"
                                + " WHERE c.id IN (:ids) AND (g.status = 'ACTIVE' OR NOT"
                                + " :activeOnly)")
                .param("ids", ids)
                .param("activeOnly", activeOnly)
                .query(this::mapCard)
                .list();
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

    /** Adds images (or the placeholder) to printing rows. */
    public List<PrintingSummary> withImages(List<PrintingRow> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<PrintingImage>> images = new LinkedHashMap<>();
        jdbc.sql(
                        """
                        SELECT printing_id, kind, url, width, height FROM card_image
                         WHERE printing_id IN (:ids)
                         ORDER BY CASE kind WHEN 'FRONT' THEN 0 WHEN 'BACK' THEN 1 ELSE 2 END
                        """)
                .param("ids", rows.stream().map(PrintingRow::id).toList())
                .query(
                        rs -> {
                            images.computeIfAbsent(
                                            rs.getObject("printing_id", UUID.class),
                                            id -> new ArrayList<>())
                                    .add(
                                            new PrintingImage(
                                                    rs.getString("kind"),
                                                    CatalogImages.resolve(rs.getString("url")),
                                                    nullableInt(rs, "width"),
                                                    nullableInt(rs, "height")));
                        });
        return rows.stream()
                .map(
                        row ->
                                row.toSummary(
                                        CatalogImages.orPlaceholder(
                                                images.getOrDefault(row.id(), List.of()),
                                                row.game(),
                                                row.cardSlug())))
                .toList();
    }

    /** Printing codes starting with {@code prefix} (autocomplete). */
    public List<CardSuggestion> suggestPrintings(@Nullable UUID gameId, String prefix, int limit) {
        return jdbc.sql(
                        """
                        SELECT p.id AS printing_id, c.id AS card_id, c.name, c.slug AS card_slug,
                               g.slug AS game, s.code AS set_code, p.printing_code, i.url
                          FROM card_printing p
                          JOIN card c ON c.id = p.card_id
                          JOIN game g ON g.id = c.game_id
                          JOIN card_set s ON s.id = p.set_id
                          LEFT JOIN card_image i ON i.id = p.image_id
                         WHERE g.status = 'ACTIVE' AND p.printing_code LIKE :prefix ESCAPE '\\'
                           AND (CAST(:gameId AS uuid) IS NULL OR c.game_id = CAST(:gameId AS uuid))
                         ORDER BY p.printing_code, p.edition, p.language, p.finish
                         LIMIT :limit
                        """)
                .param("prefix", CatalogText.escapeLike(prefix) + "%")
                .param("gameId", gameId, java.sql.Types.OTHER)
                .param("limit", limit)
                .query(
                        (rs, rowNum) ->
                                new CardSuggestion(
                                        CardSuggestion.PRINTING,
                                        rs.getObject("card_id", UUID.class),
                                        rs.getObject("printing_id", UUID.class),
                                        rs.getString("name"),
                                        rs.getString("game"),
                                        rs.getString("set_code"),
                                        rs.getString("printing_code"),
                                        CatalogImages.resolveOrPlaceholder(
                                                rs.getString("url"),
                                                rs.getString("game"),
                                                rs.getString("card_slug"))))
                .list();
    }

    /** Cards whose name starts with, contains, full-text matches or resembles {@code query}. */
    public List<CardSuggestion> suggestCards(@Nullable UUID gameId, String query, int limit) {
        String normalised = CatalogText.normalise(query);
        String escaped = CatalogText.escapeLike(normalised);
        return jdbc.sql(
                        """
                        SELECT c.id, c.name, c.slug, g.slug AS game,
                               pp.set_code, pp.printing_code, pp.url
                          FROM card c
                          JOIN game g ON g.id = c.game_id
                          LEFT JOIN LATERAL (
                                SELECT s.code AS set_code, p.printing_code, i.url
                                  FROM card_printing p
                                  JOIN card_set s ON s.id = p.set_id
                                  LEFT JOIN card_image i ON i.id = p.image_id
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
                                new CardSuggestion(
                                        CardSuggestion.CARD,
                                        rs.getObject("id", UUID.class),
                                        null,
                                        rs.getString("name"),
                                        rs.getString("game"),
                                        rs.getString("set_code"),
                                        rs.getString("printing_code"),
                                        CatalogImages.resolveOrPlaceholder(
                                                rs.getString("url"),
                                                rs.getString("game"),
                                                rs.getString("slug"))))
                .list();
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
    // Mapping
    // ---------------------------------------------------------------------------------------

    private long count(String from, Map<String, Object> params) {
        return jdbc.sql("SELECT count(*) " + from).params(params).query(Long.class).single();
    }

    private CardSummary mapCard(ResultSet rs, int rowNum) throws SQLException {
        String game = rs.getString("game");
        String slug = rs.getString("slug");
        return new CardSummary(
                rs.getObject("id", UUID.class),
                game,
                rs.getString("name"),
                slug,
                rs.getString("card_type"),
                rs.getString("subtype"),
                CatalogImages.resolveOrPlaceholder(rs.getString("image_url"), game, slug),
                rs.getInt("printing_count"),
                readMap(rs.getString("metadata")));
    }

    private PrintingRow mapPrinting(ResultSet rs, int rowNum) throws SQLException {
        @Nullable MarketPrice price = null;
        if (rs.getBigDecimal("market_price") != null) {
            Timestamp updated = rs.getTimestamp("market_price_updated_at");
            price =
                    new MarketPrice(
                            rs.getBigDecimal("market_price"),
                            rs.getString("market_price_currency"),
                            updated == null ? null : updated.toInstant());
        }
        return new PrintingRow(
                rs.getObject("id", UUID.class),
                rs.getObject("card_id", UUID.class),
                rs.getObject("set_id", UUID.class),
                rs.getString("set_code"),
                rs.getString("set_name"),
                rs.getString("collector_number"),
                rs.getString("printing_code"),
                rs.getString("rarity"),
                rs.getString("edition"),
                rs.getString("language"),
                rs.getString("finish"),
                price,
                readMap(rs.getString("metadata")),
                rs.getString("game"),
                rs.getString("card_slug"));
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
            String collectorNumber,
            @Nullable String printingCode,
            @Nullable String rarity,
            String edition,
            String language,
            String finish,
            @Nullable MarketPrice marketPrice,
            Map<String, Object> metadata,
            String game,
            String cardSlug) {

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
                    marketPrice);
        }
    }
}
