package com.orenjitrade.api.cards.infra;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
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

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;

    public CatalogWriteRepository(JdbcClient jdbc, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
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
        jdbc.sql(
                        """
                        INSERT INTO card (id, game_id, name, slug, card_type, subtype, text, metadata,
                            external_ref, created_at, updated_at)
                        VALUES (:id, :gameId, :name, :slug, :cardType, :subtype, :text,
                            CAST(:metadata AS jsonb), CAST(:externalRef AS jsonb), :now, :now)
                        """)
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
        return jdbc.sql(
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
                                """)
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

    public Optional<UUID> findPrintingByVariant(
            UUID setId, String collectorNumber, String edition, String language, String finish) {
        return jdbc.sql(
                        """
                        SELECT id FROM card_printing
                         WHERE set_id = :setId AND collector_number = :number AND edition = :edition
                           AND language = :language AND finish = :finish
                        """)
                .param("setId", setId)
                .param("number", collectorNumber)
                .param("edition", edition)
                .param("language", language)
                .param("finish", finish)
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
        jdbc.sql(
                        """
                        INSERT INTO card_printing (id, card_id, set_id, collector_number, rarity,
                            edition, language, finish, printing_code, market_price,
                            market_price_currency, market_price_updated_at, metadata, external_ref,
                            created_at, updated_at)
                        VALUES (:id, :cardId, :setId, :number, :rarity, :edition, :language, :finish,
                            :code, :price, :currency, :priceUpdatedAt, CAST(:metadata AS jsonb),
                            CAST(:externalRef AS jsonb), :now, :now)
                        """)
                .param("id", id)
                .param("cardId", cardId)
                .param("setId", setId)
                .params(printingParams(values))
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Updates a printing when a value differs. */
    public boolean updatePrinting(UUID id, UUID setId, PrintingValues values, Instant now) {
        return jdbc.sql(
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
                                """)
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
                                INSERT INTO card_image (id, printing_id, kind, url, width, height,
                                    source, created_at, updated_at)
                                VALUES (:id, :printingId, :kind, :url, :width, :height, :source, :now, :now)
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
}
