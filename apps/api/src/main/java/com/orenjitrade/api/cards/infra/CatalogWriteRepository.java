package com.orenjitrade.api.cards.infra;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/**
 * Write side of the catalog: idempotent upserts for {@code CatalogImportService} (rows are only
 * rewritten when a value actually changed, so the returned flags count real changes) and the admin
 * edits. Every statement joins the caller's transaction.
 */
@Repository
public class CatalogWriteRepository {

    private static final String INSERT_CARD =
            """
            INSERT INTO card (id, game_id, name, slug, card_type, subtype, text, metadata,
                external_ref, created_at, updated_at)
            VALUES (:id, :gameId, :name, :slug, :cardType, :subtype, :text,
                CAST(:metadata AS jsonb), CAST(:externalRef AS jsonb), :now, :now)
            """;

    private static final String UPDATE_CARD =
            """
            UPDATE card
               SET name = :name, card_type = :cardType, subtype = :subtype,
                   text = :text, metadata = CAST(:metadata AS jsonb),
                   updated_at = :now
             WHERE id = :id
               AND (name, card_type, subtype, text, metadata)
                   IS DISTINCT FROM
                   (CAST(:name AS text), CAST(:cardType AS text),
                    CAST(:subtype AS text), CAST(:text AS text),
                    CAST(:metadata AS jsonb))
            """;

    private static final String INSERT_PRINTING =
            """
            INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity,
                edition, language, finish, printing_code, market_price,
                market_price_currency, market_price_updated_at, metadata, external_ref,
                created_at, updated_at)
            VALUES (:id, :cardId, :setId, :number, :rarity, :edition, :language, :finish,
                :code, :price, :currency, :priceUpdatedAt, CAST(:metadata AS jsonb),
                CAST(:externalRef AS jsonb), :now, :now)
            """;

    private static final String UPDATE_PRINTING =
            """
            UPDATE card_printing
               SET set_id = :setId, collector_number = :number, rarity = :rarity,
                   edition = :edition, language = :language, finish = :finish,
                   printing_code = :code, market_price = :price,
                   market_price_currency = :currency,
                   market_price_updated_at = :priceUpdatedAt,
                   metadata = CAST(:metadata AS jsonb),
                   external_ref = COALESCE(CAST(:externalRef AS jsonb), external_ref),
                   updated_at = :now
             WHERE id = :id
               AND (set_id, collector_number, rarity, edition, language, finish,
                    printing_code, market_price, market_price_currency,
                    market_price_updated_at, metadata, external_ref)
                   IS DISTINCT FROM
                   (CAST(:setId AS uuid), CAST(:number AS text),
                    CAST(:rarity AS text), CAST(:edition AS text),
                    CAST(:language AS text), CAST(:finish AS text),
                    CAST(:code AS text), CAST(:price AS numeric(12,2)),
                    CAST(:currency AS char(3)),
                    CAST(:priceUpdatedAt AS timestamptz),
                    CAST(:metadata AS jsonb),
                    COALESCE(CAST(:externalRef AS jsonb), external_ref))
            """;

    private final JdbcClient jdbc;
    private final NamedParameterJdbcTemplate named;
    private final JsonMapper jsonMapper;

    public CatalogWriteRepository(
            JdbcClient jdbc, NamedParameterJdbcTemplate named, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.named = named;
        this.jsonMapper = jsonMapper;
    }

    /** Serialises imports of one game (transaction-scoped advisory lock). */
    public void lockGameImport(UUID gameId) {
        jdbc.sql(
                        "SELECT pg_advisory_xact_lock(hashtext('catalog-import:' || CAST(:gameId AS"
                                + " text)))")
                .param("gameId", gameId.toString())
                .query(rs -> {});
    }

    // ---------------------------------------------------------------------------------------
    // Sets
    // ---------------------------------------------------------------------------------------

    public Optional<UUID> findSetId(UUID gameId, String code) {
        return jdbc.sql("SELECT id FROM card_set WHERE game_id = :gameId AND code = :code")
                .param("gameId", gameId)
                .param("code", code)
                .query(UUID.class)
                .optional();
    }

    /**
     * Inserts or updates the set {@code (gameId, code)}.
     *
     * @return the set id and whether a row was inserted or changed
     */
    public Upsert upsertSet(
            UUID gameId,
            String code,
            String name,
            @Nullable LocalDate releaseDate,
            @Nullable Integer totalCards,
            @Nullable String series,
            Map<String, Object> metadata,
            @Nullable Map<String, String> externalRef,
            Instant now) {
        Optional<UUID> existing = findSetId(gameId, code);
        if (existing.isEmpty()) {
            UUID id = UUID.randomUUID();
            jdbc.sql(
                            """
                            INSERT INTO card_set (id, game_id, code, name, release_date, total_cards,
                                series, metadata, external_ref, created_at, updated_at)
                            VALUES (:id, :gameId, :code, :name, :releaseDate, :totalCards, :series,
                                CAST(:metadata AS jsonb), CAST(:externalRef AS jsonb), :now, :now)
                            """)
                    .param("id", id)
                    .param("gameId", gameId)
                    .param("code", code)
                    .param("name", name)
                    .param(
                            "releaseDate",
                            releaseDate == null ? null : Date.valueOf(releaseDate),
                            java.sql.Types.DATE)
                    .param("totalCards", totalCards, java.sql.Types.INTEGER)
                    .param("series", series, java.sql.Types.VARCHAR)
                    .param("metadata", json(metadata))
                    .param(
                            "externalRef",
                            externalRef == null ? null : json(externalRef),
                            java.sql.Types.VARCHAR)
                    .param("now", Timestamp.from(now))
                    .update();
            return new Upsert(id, true);
        }
        int changed =
                jdbc.sql(
                                """
                                UPDATE card_set
                                   SET name = :name, release_date = :releaseDate,
                                       total_cards = :totalCards, series = :series,
                                       metadata = CAST(:metadata AS jsonb),
                                       external_ref = COALESCE(CAST(:externalRef AS jsonb), external_ref),
                                       updated_at = :now
                                 WHERE id = :id
                                   AND (name, release_date, total_cards, series, metadata,
                                        external_ref)
                                       IS DISTINCT FROM
                                       (CAST(:name AS text), CAST(:releaseDate AS date),
                                        CAST(:totalCards AS integer), CAST(:series AS text),
                                        CAST(:metadata AS jsonb),
                                        COALESCE(CAST(:externalRef AS jsonb), external_ref))
                                """)
                        .param("id", existing.get())
                        .param("name", name)
                        .param(
                                "releaseDate",
                                releaseDate == null ? null : Date.valueOf(releaseDate),
                                java.sql.Types.DATE)
                        .param("totalCards", totalCards, java.sql.Types.INTEGER)
                        .param("series", series, java.sql.Types.VARCHAR)
                        .param("metadata", json(metadata))
                        .param(
                                "externalRef",
                                externalRef == null ? null : json(externalRef),
                                java.sql.Types.VARCHAR)
                        .param("now", Timestamp.from(now))
                        .update();
        return new Upsert(existing.get(), changed > 0);
    }

    // ---------------------------------------------------------------------------------------
    // Cards
    // ---------------------------------------------------------------------------------------

    public Optional<CardRef> findCardByExternalRef(String provider, String externalId) {
        return jdbc.sql(
                        """
                        SELECT id, slug FROM card
                         WHERE external_ref ->> 'provider' = :provider AND external_ref ->> 'id' = :externalId
                        """)
                .param("provider", provider)
                .param("externalId", externalId)
                .query(
                        (rs, rowNum) ->
                                new CardRef(rs.getObject("id", UUID.class), rs.getString("slug")))
                .optional();
    }

    public Optional<CardRef> findCard(UUID id) {
        return jdbc.sql("SELECT id, slug FROM card WHERE id = :id")
                .param("id", id)
                .query(
                        (rs, rowNum) ->
                                new CardRef(rs.getObject("id", UUID.class), rs.getString("slug")))
                .optional();
    }

    public boolean slugExists(UUID gameId, String slug) {
        return jdbc.sql("SELECT count(*) FROM card WHERE game_id = :gameId AND slug = :slug")
                        .param("gameId", gameId)
                        .param("slug", slug)
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void insertCard(
            UUID id,
            UUID gameId,
            String name,
            String slug,
            @Nullable String cardType,
            @Nullable String subtype,
            String text,
            Map<String, Object> metadata,
            @Nullable Map<String, String> externalRef,
            Instant now) {
        jdbc.sql(INSERT_CARD)
                .param("id", id)
                .param("gameId", gameId)
                .param("name", name)
                .param("slug", slug)
                .param("cardType", cardType, java.sql.Types.VARCHAR)
                .param("subtype", subtype, java.sql.Types.VARCHAR)
                .param("text", text)
                .param("metadata", json(metadata))
                .param(
                        "externalRef",
                        externalRef == null ? null : json(externalRef),
                        java.sql.Types.VARCHAR)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Updates a card when a value differs; the slug never changes (stable URLs). */
    public boolean updateCard(
            UUID id,
            String name,
            @Nullable String cardType,
            @Nullable String subtype,
            String text,
            Map<String, Object> metadata,
            Instant now) {
        return jdbc.sql(UPDATE_CARD)
                        .param("id", id)
                        .param("name", name)
                        .param("cardType", cardType, java.sql.Types.VARCHAR)
                        .param("subtype", subtype, java.sql.Types.VARCHAR)
                        .param("text", text)
                        .param("metadata", json(metadata))
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    // ---------------------------------------------------------------------------------------
    // Printings
    // ---------------------------------------------------------------------------------------

    public Optional<UUID> findPrintingByExternalRef(String provider, String externalId) {
        return jdbc.sql(
                        """
                        SELECT id FROM card_printing
                         WHERE external_ref ->> 'provider' = :provider AND external_ref ->> 'id' = :externalId
                        """)
                .param("provider", provider)
                .param("externalId", externalId)
                .query(UUID.class)
                .optional();
    }

    /**
     * The printing with this variant key (set, collector number, edition, language, finish and
     * rarity: Yu-Gi-Oh! reprints a code in several rarities).
     */
    public Optional<UUID> findPrintingByVariant(
            UUID setId,
            String collectorNumber,
            String edition,
            String language,
            String finish,
            @Nullable String rarity) {
        return jdbc.sql(
                        """
                        SELECT id FROM card_printing
                         WHERE set_id = :setId AND collector_number = :number AND edition = :edition
                           AND language = :language AND finish = :finish
                           AND coalesce(rarity, '') = coalesce(CAST(:rarity AS text), '')
                        """)
                .param("setId", setId)
                .param("number", collectorNumber)
                .param("edition", edition)
                .param("language", language)
                .param("finish", finish)
                .param("rarity", rarity, java.sql.Types.VARCHAR)
                .query(UUID.class)
                .optional();
    }

    /** The card and set of a printing. */
    public Optional<PrintingRef> findPrinting(UUID id) {
        return jdbc.sql("SELECT id, card_id, set_id FROM card_printing WHERE id = :id")
                .param("id", id)
                .query(
                        (rs, rowNum) ->
                                new PrintingRef(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("card_id", UUID.class),
                                        rs.getObject("set_id", UUID.class)))
                .optional();
    }

    public void insertPrinting(
            UUID id, UUID cardId, UUID setId, PrintingValues values, Instant now) {
        jdbc.sql(INSERT_PRINTING)
                .param("id", id)
                .param("cardId", cardId)
                .param("setId", setId)
                .params(printingParams(values))
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Updates a printing when a value differs. */
    public boolean updatePrinting(UUID id, UUID setId, PrintingValues values, Instant now) {
        return jdbc.sql(UPDATE_PRINTING)
                        .param("id", id)
                        .param("setId", setId)
                        .params(printingParams(values))
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    private Map<String, Object> printingParams(PrintingValues values) {
        java.util.HashMap<String, Object> params = new java.util.HashMap<>();
        params.put("number", values.collectorNumber());
        params.put("rarity", values.rarity());
        params.put("edition", values.edition());
        params.put("language", values.language());
        params.put("finish", values.finish());
        params.put("code", values.printingCode());
        params.put("price", values.marketPrice());
        params.put("currency", values.marketPriceCurrency());
        params.put(
                "priceUpdatedAt",
                values.marketPriceUpdatedAt() == null
                        ? null
                        : Timestamp.from(values.marketPriceUpdatedAt()));
        params.put("metadata", json(values.metadata()));
        params.put("externalRef", values.externalRef() == null ? null : json(values.externalRef()));
        return params;
    }

    // ---------------------------------------------------------------------------------------
    // Images
    // ---------------------------------------------------------------------------------------

    /**
     * Inserts or updates the {@code kind} image of a printing and, for FRONT images, points {@code
     * card_printing.image_id} at it.
     *
     * @return whether anything changed
     */
    public boolean upsertImage(
            UUID gameId,
            UUID cardId,
            UUID printingId,
            String kind,
            String url,
            @Nullable Integer width,
            @Nullable Integer height,
            String source,
            Instant now) {
        boolean changed =
                !jdbc.sql(
                                """
                                INSERT INTO card_image (id, game_id, card_id, printing_id, kind, url,
                                    width, height, source, created_at, updated_at)
                                VALUES (:id, :gameId, :cardId, :printingId, :kind, :url, :width,
                                    :height, :source, :now, :now)
                                ON CONFLICT (printing_id, kind) DO UPDATE
                                   SET url = EXCLUDED.url, width = EXCLUDED.width,
                                       height = EXCLUDED.height, source = EXCLUDED.source,
                                       updated_at = EXCLUDED.updated_at
                                 WHERE (card_image.url, card_image.width, card_image.height,
                                        card_image.source)
                                       IS DISTINCT FROM
                                       (EXCLUDED.url, EXCLUDED.width, EXCLUDED.height, EXCLUDED.source)
                                RETURNING id
                                """)
                        .param("id", UUID.randomUUID())
                        .param("gameId", gameId)
                        .param("cardId", cardId)
                        .param("printingId", printingId)
                        .param("kind", kind)
                        .param("url", url)
                        .param("width", width, java.sql.Types.INTEGER)
                        .param("height", height, java.sql.Types.INTEGER)
                        .param("source", source)
                        .param("now", Timestamp.from(now))
                        .query(UUID.class)
                        .list()
                        .isEmpty();
        if ("FRONT".equals(kind)) {
            int linked =
                    jdbc.sql(
                                    """
                                    UPDATE card_printing p SET image_id = i.id
                                      FROM card_image i
                                     WHERE p.id = :printingId AND i.printing_id = p.id
                                       AND i.kind = 'FRONT' AND p.image_id IS DISTINCT FROM i.id
                                    """)
                            .param("printingId", printingId)
                            .update();
            changed = changed || linked > 0;
        }
        return changed;
    }

    // ---------------------------------------------------------------------------------------
    // Import state (prefetched once per import, then kept in memory)
    // ---------------------------------------------------------------------------------------

    /** Id and owning provider of the set {@code (gameId, code)}. */
    public Optional<SetRef> findSetRef(UUID gameId, String code) {
        return jdbc.sql(
                        "SELECT id, external_ref ->> 'provider' AS provider FROM card_set WHERE"
                                + " game_id = :gameId AND code = :code")
                .param("gameId", gameId)
                .param("code", code)
                .query(
                        (rs, rowNum) ->
                                new SetRef(
                                        rs.getObject("id", UUID.class), rs.getString("provider")))
                .optional();
    }

    /** Card ids of a provider in a game, by external id. */
    public Map<String, UUID> cardIdsByExternalRef(UUID gameId, String provider) {
        Map<String, UUID> ids = new HashMap<>();
        jdbc.sql(
                        """
                        SELECT id, external_ref ->> 'id' AS external_id FROM card
                         WHERE game_id = :gameId AND external_ref ->> 'provider' = :provider
                        """)
                .param("gameId", gameId)
                .param("provider", provider)
                .query(
                        rs -> {
                            ids.put(rs.getString("external_id"), rs.getObject("id", UUID.class));
                        });
        return ids;
    }

    /** Primary image of every card of a game that has one. */
    public Map<UUID, UUID> cardImageIds(UUID gameId) {
        Map<UUID, UUID> ids = new HashMap<>();
        jdbc.sql("SELECT id, image_id FROM card WHERE game_id = :gameId AND image_id IS NOT NULL")
                .param("gameId", gameId)
                .query(
                        rs -> {
                            ids.put(
                                    rs.getObject("id", UUID.class),
                                    rs.getObject("image_id", UUID.class));
                        });
        return ids;
    }

    /** Every slug of a game. */
    public Set<String> slugs(UUID gameId) {
        return new HashSet<>(
                jdbc.sql("SELECT slug FROM card WHERE game_id = :gameId")
                        .param("gameId", gameId)
                        .query(String.class)
                        .list());
    }

    /** Variant keys, owners and provider identities of every printing of a game. */
    public List<PrintingState> printingStates(UUID gameId) {
        return jdbc.sql(
                        """
                        SELECT p.id, p.card_id, p.set_id, p.collector_number, p.edition, p.language,
                               p.finish, p.rarity, p.external_ref ->> 'provider' AS provider,
                               p.external_ref ->> 'id' AS external_id
                          FROM card_printing p JOIN card c ON c.id = p.card_id
                         WHERE c.game_id = :gameId
                        """)
                .param("gameId", gameId)
                .query(
                        (rs, rowNum) ->
                                new PrintingState(
                                        rs.getObject("id", UUID.class),
                                        rs.getObject("card_id", UUID.class),
                                        variantKey(
                                                rs.getObject("set_id", UUID.class),
                                                rs.getString("collector_number"),
                                                rs.getString("edition"),
                                                rs.getString("language"),
                                                rs.getString("finish"),
                                                rs.getString("rarity")),
                                        rs.getString("provider"),
                                        rs.getString("external_id")))
                .list();
    }

    /** Provider artworks by provider image id. */
    public Map<String, UUID> providerImageIds(String provider) {
        Map<String, UUID> ids = new HashMap<>();
        jdbc.sql(
                        "SELECT id, provider_image_id FROM card_image WHERE provider = :provider"
                                + " AND provider_image_id IS NOT NULL")
                .param("provider", provider)
                .query(
                        rs -> {
                            ids.put(
                                    rs.getString("provider_image_id"),
                                    rs.getObject("id", UUID.class));
                        });
        return ids;
    }

    /** Key identifying a printing variant (unique per game through the set). */
    public static String variantKey(
            UUID setId,
            String collectorNumber,
            String edition,
            String language,
            String finish,
            @Nullable String rarity) {
        return setId
                + "|"
                + collectorNumber
                + "|"
                + edition
                + "|"
                + language
                + "|"
                + finish
                + "|"
                + (rarity == null ? "" : rarity);
    }

    // ---------------------------------------------------------------------------------------
    // Import batches (one round trip per statement type and chunk)
    // ---------------------------------------------------------------------------------------

    public void insertCards(List<CardWrite> rows, Instant now) {
        if (rows.isEmpty()) {
            return;
        }
        named.batchUpdate(
                INSERT_CARD,
                rows.stream()
                        .map(
                                row ->
                                        cardParams(row, now)
                                                .addValue("gameId", row.gameId())
                                                .addValue("slug", row.slug())
                                                .addValue(
                                                        "externalRef",
                                                        row.externalRef() == null
                                                                ? null
                                                                : json(row.externalRef()),
                                                        Types.VARCHAR))
                        .toArray(MapSqlParameterSource[]::new));
    }

    /** Updates cards whose values differ; returns the changed-row count per input row. */
    public int[] updateCards(List<CardWrite> rows, Instant now) {
        if (rows.isEmpty()) {
            return new int[0];
        }
        return named.batchUpdate(
                UPDATE_CARD,
                rows.stream()
                        .map(row -> cardParams(row, now))
                        .toArray(MapSqlParameterSource[]::new));
    }

    private MapSqlParameterSource cardParams(CardWrite row, Instant now) {
        return new MapSqlParameterSource()
                .addValue("id", row.id())
                .addValue("name", row.name())
                .addValue("cardType", row.cardType(), Types.VARCHAR)
                .addValue("subtype", row.subtype(), Types.VARCHAR)
                .addValue("text", row.text())
                .addValue("metadata", json(row.metadata()))
                .addValue("now", Timestamp.from(now));
    }

    public void insertPrintings(List<PrintingWrite> rows, Instant now) {
        if (rows.isEmpty()) {
            return;
        }
        named.batchUpdate(
                INSERT_PRINTING,
                rows.stream()
                        .map(row -> printingSource(row, now).addValue("cardId", row.cardId()))
                        .toArray(MapSqlParameterSource[]::new));
    }

    /** Updates printings whose values differ; returns the changed-row count per input row. */
    public int[] updatePrintings(List<PrintingWrite> rows, Instant now) {
        if (rows.isEmpty()) {
            return new int[0];
        }
        return named.batchUpdate(
                UPDATE_PRINTING,
                rows.stream()
                        .map(row -> printingSource(row, now))
                        .toArray(MapSqlParameterSource[]::new));
    }

    private MapSqlParameterSource printingSource(PrintingWrite row, Instant now) {
        PrintingValues values = row.values();
        return new MapSqlParameterSource()
                .addValue("id", row.id())
                .addValue("setId", row.setId())
                .addValue("number", values.collectorNumber())
                .addValue("rarity", values.rarity(), Types.VARCHAR)
                .addValue("edition", values.edition())
                .addValue("language", values.language())
                .addValue("finish", values.finish())
                .addValue("code", values.printingCode(), Types.VARCHAR)
                .addValue("price", values.marketPrice(), Types.NUMERIC)
                .addValue("currency", values.marketPriceCurrency(), Types.VARCHAR)
                .addValue(
                        "priceUpdatedAt",
                        values.marketPriceUpdatedAt() == null
                                ? null
                                : Timestamp.from(values.marketPriceUpdatedAt()),
                        Types.TIMESTAMP)
                .addValue("metadata", json(values.metadata()))
                .addValue(
                        "externalRef",
                        values.externalRef() == null ? null : json(values.externalRef()),
                        Types.VARCHAR)
                .addValue("now", Timestamp.from(now));
    }

    /** Inserts provider artworks (NOT_CACHED, source URL kept server-side). */
    public void insertProviderImages(List<ProviderImageWrite> rows, Instant now) {
        if (rows.isEmpty()) {
            return;
        }
        named.batchUpdate(
                """
                INSERT INTO card_image (id, game_id, card_id, printing_id, kind, url, width, height,
                    source, provider, provider_image_id, position, source_url, cache_status,
                    created_at, updated_at)
                VALUES (:id, :gameId, :cardId, NULL, :kind, NULL, NULL, NULL, :source, :provider,
                    :providerImageId, :position, :sourceUrl, 'NOT_CACHED', :now, :now)
                """,
                rows.stream()
                        .map(row -> imageSource(row, now))
                        .toArray(MapSqlParameterSource[]::new));
    }

    /**
     * Updates provider artworks whose owner, order or source changed (the cache state is kept: the
     * artwork id is stable); returns the changed-row count per input row.
     */
    public int[] updateProviderImages(List<ProviderImageWrite> rows, Instant now) {
        if (rows.isEmpty()) {
            return new int[0];
        }
        return named.batchUpdate(
                """
                UPDATE card_image
                   SET game_id = :gameId, card_id = :cardId, kind = :kind, position = :position,
                       source_url = :sourceUrl, source = :source, updated_at = :now
                 WHERE id = :id
                   AND (game_id, card_id, kind, position, source_url, source)
                       IS DISTINCT FROM
                       (CAST(:gameId AS uuid), CAST(:cardId AS uuid), CAST(:kind AS text),
                        CAST(:position AS integer), CAST(:sourceUrl AS text), CAST(:source AS text))
                """,
                rows.stream()
                        .map(row -> imageSource(row, now))
                        .toArray(MapSqlParameterSource[]::new));
    }

    private MapSqlParameterSource imageSource(ProviderImageWrite row, Instant now) {
        return new MapSqlParameterSource()
                .addValue("id", row.id())
                .addValue("gameId", row.gameId())
                .addValue("cardId", row.cardId())
                .addValue("kind", row.kind())
                .addValue("source", row.provider())
                .addValue("provider", row.provider())
                .addValue("providerImageId", row.providerImageId())
                .addValue("position", row.position())
                .addValue("sourceUrl", row.sourceUrl())
                .addValue("now", Timestamp.from(now));
    }

    /** Points cards at their primary artwork; returns the changed-row count per input row. */
    public int[] linkCardImages(List<CardImageLink> rows, Instant now) {
        if (rows.isEmpty()) {
            return new int[0];
        }
        return named.batchUpdate(
                """
                UPDATE card SET image_id = CAST(:imageId AS uuid), updated_at = :now
                 WHERE id = :cardId AND image_id IS DISTINCT FROM CAST(:imageId AS uuid)
                """,
                rows.stream()
                        .map(
                                row ->
                                        new MapSqlParameterSource()
                                                .addValue("cardId", row.cardId())
                                                .addValue("imageId", row.imageId(), Types.OTHER)
                                                .addValue("now", Timestamp.from(now)))
                        .toArray(MapSqlParameterSource[]::new));
    }

    /** Sums batch update counts (JDBC may report SUCCESS_NO_INFO as -2: counted as changed). */
    public static int changed(int[] counts) {
        int total = 0;
        for (int count : counts) {
            total += count == java.sql.Statement.SUCCESS_NO_INFO ? 1 : Math.max(0, count);
        }
        return total;
    }

    private String json(Object value) {
        return jsonMapper.writeValueAsString(value);
    }

    /**
     * Insert-or-update outcome.
     *
     * @param id the row id
     * @param changed whether a row was inserted or modified
     */
    public record Upsert(UUID id, boolean changed) {}

    /** Id and slug of a card. */
    public record CardRef(UUID id, String slug) {}

    /** Ids of a printing, its card and its set. */
    public record PrintingRef(UUID id, UUID cardId, UUID setId) {}

    /** Column values of a printing. */
    public record PrintingValues(
            String collectorNumber,
            @Nullable String rarity,
            String edition,
            String language,
            String finish,
            @Nullable String printingCode,
            @Nullable BigDecimal marketPrice,
            @Nullable String marketPriceCurrency,
            @Nullable Instant marketPriceUpdatedAt,
            Map<String, Object> metadata,
            @Nullable Map<String, String> externalRef) {}

    /**
     * Id and owning provider of a set.
     *
     * @param id set id
     * @param provider provider of its {@code external_ref}, {@code null} for admin-created sets
     */
    public record SetRef(UUID id, @Nullable String provider) {}

    /** A printing's identity for the import. */
    public record PrintingState(
            UUID id,
            UUID cardId,
            String variantKey,
            @Nullable String provider,
            @Nullable String externalId) {}

    /** A card row to insert or update. */
    public record CardWrite(
            UUID id,
            UUID gameId,
            String name,
            String slug,
            @Nullable String cardType,
            @Nullable String subtype,
            String text,
            Map<String, Object> metadata,
            @Nullable Map<String, String> externalRef) {}

    /** A printing row to insert or update. */
    public record PrintingWrite(UUID id, UUID cardId, UUID setId, PrintingValues values) {}

    /** A provider artwork row to insert or update. */
    public record ProviderImageWrite(
            UUID id,
            UUID gameId,
            UUID cardId,
            String kind,
            String provider,
            String providerImageId,
            int position,
            String sourceUrl) {}

    /** {@code card.image_id} of a card. */
    public record CardImageLink(UUID cardId, @Nullable UUID imageId) {}
}
