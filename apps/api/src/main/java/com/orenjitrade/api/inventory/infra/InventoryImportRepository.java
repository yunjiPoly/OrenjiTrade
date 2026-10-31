package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.inventory.domain.imports.ConditionSource;
import com.orenjitrade.api.inventory.domain.imports.ImportDraftRow;
import com.orenjitrade.api.inventory.domain.imports.ImportRecord;
import com.orenjitrade.api.inventory.domain.imports.ImportResult;
import com.orenjitrade.api.inventory.domain.imports.ImportRow;
import com.orenjitrade.api.inventory.domain.imports.ImportSource;
import com.orenjitrade.api.inventory.domain.imports.ImportStatus;
import com.orenjitrade.api.inventory.domain.imports.ImportSummary;
import com.orenjitrade.api.inventory.domain.imports.PrintingChoice;
import com.orenjitrade.api.inventory.domain.imports.RowStatus;
import com.orenjitrade.api.inventory.domain.imports.UnmatchedReason;
import java.sql.Array;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code inventory_import} and {@code inventory_import_row} access (explicit SQL): the stored
 * preview of an inventory import. Nothing here touches {@code binder} or {@code inventory_item}:
 * the items of a commit are written by {@code InventoryService.importLines}, under the locks of
 * every inventory write.
 *
 * <p>An import row is locked ({@link #lock}) by every edit and by every chunk of a commit, so an
 * edit and a commit never work on the same preview at once. A commit takes the owner lock of the
 * collector before it; an edit takes no other lock. An upload takes the collector's upload lock
 * ({@link #lockUploadsOf}) before it replaces the open preview, so two uploads of one collector run
 * one after the other.
 */
@Repository
public class InventoryImportRepository {

    /** Rows of one insert batch. */
    static final int INSERT_BATCH = 500;

    private static final String IMPORT_COLUMNS =
            """
            id, owner_id, source, status, include_main, include_extra, include_side, ignored_lines,
            revision, total_chunks, chunks_done, chunk_new_items, result::text AS result,
            created_at, expires_at, committed_at
            """;

    private static final String ROW_COLUMNS =
            """
            r.id, r.import_id, r.position, r.passcode, r.source_name, r.source_set,
            r.source_number, r.source_rarity, r.qty_main, r.qty_extra, r.qty_side,
            r.file_quantity, r.quantity, r.card_id, r.unmatched_reason, r.printing_count,
            r.suggested_printing_ids, r.printing_id, r.printing_choice, r.condition,
            r.condition_source, r.language, r.edition, r.included, r.commit_chunk
            """;

    /** The sections of the deck that count hold the row (needs aliases {@code r} and {@code i}). */
    private static final String IN_SCOPE =
            "(i.source <> 'YDK' OR (i.include_main AND r.qty_main > 0)"
                    + " OR (i.include_extra AND r.qty_extra > 0)"
                    + " OR (i.include_side AND r.qty_side > 0))";

    /** The copies a row adds (needs aliases {@code r} and {@code i}). */
    private static final String COPIES =
            "(CASE WHEN r.quantity IS NOT NULL THEN r.quantity"
                    + " WHEN i.source = 'YDK' THEN LEAST(9999,"
                    + " (CASE WHEN i.include_main THEN COALESCE(r.qty_main, 0) ELSE 0 END)"
                    + " + (CASE WHEN i.include_extra THEN COALESCE(r.qty_extra, 0) ELSE 0 END)"
                    + " + (CASE WHEN i.include_side THEN COALESCE(r.qty_side, 0) ELSE 0 END))"
                    + " ELSE r.file_quantity END)";

    private static final String KEPT = "(r.included AND " + IN_SCOPE + " AND " + COPIES + " >= 1)";

    /**
     * The row has a printing the bulk action took as the plain copy of several versions, and the
     * collector has not confirmed or changed it since (needs alias {@code r}). A printing that left
     * the catalog leaves the row without one: it is to choose again, not to check.
     */
    private static final String ASSUMED =
            "(r.printing_id IS NOT NULL AND r.printing_choice = 'MOST_RECENT_ASSUMED')";

    /**
     * The private items the collector of the preview {@code :id} already has, one row per printing,
     * condition, edition and language, among the printings of the preview (needs aliases {@code r}
     * and {@code p}): a row that joins one is added to that item instead of becoming a new one. An
     * item the collector shows (visibility other than PRIVATE) is never raised by an import. Read
     * only, without a lock: a count for the preview, the commit decides again under the locks.
     */
    private static final String OWNED_KEYS =
            " LEFT JOIN (SELECT DISTINCT it.printing_id, it.condition, it.edition, it.language"
                    + " FROM inventory_item it"
                    + " WHERE it.deleted_at IS NULL AND it.visibility = 'PRIVATE'"
                    + " AND it.owner_id = (SELECT owner_id FROM inventory_import WHERE id = :id)"
                    + " AND it.printing_id IN (SELECT printing_id FROM inventory_import_row"
                    + " WHERE import_id = :id AND printing_id IS NOT NULL)) own"
                    + " ON own.printing_id = r.printing_id AND own.condition = r.condition"
                    + " AND own.edition = COALESCE(r.edition, p.edition)"
                    + " AND own.language = COALESCE(r.language, p.language)";

    private final JdbcClient jdbc;
    private final JdbcTemplate template;
    private final JsonMapper jsonMapper;

    public InventoryImportRepository(
            JdbcClient jdbc, JdbcTemplate template, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.template = template;
        this.jsonMapper = jsonMapper;
    }

    // ---------------------------------------------------------------------------------------
    // The preview
    // ---------------------------------------------------------------------------------------

    /** Stores a new preview with its rows. */
    public void insert(
            UUID id,
            UUID ownerId,
            ImportSource source,
            int ignoredLines,
            List<ImportDraftRow> rows,
            Instant now,
            Instant expiresAt) {
        jdbc.sql(
                        """
                        INSERT INTO inventory_import (id, owner_id, source, ignored_lines,
                            created_at, updated_at, expires_at)
                        VALUES (:id, :ownerId, :source, :ignoredLines, :now, :now, :expiresAt)
                        """)
                .param("id", id)
                .param("ownerId", ownerId)
                .param("source", source.name())
                .param("ignoredLines", ignoredLines)
                .param("now", Timestamp.from(now))
                .param("expiresAt", Timestamp.from(expiresAt))
                .update();
        template.batchUpdate(
                """
                INSERT INTO inventory_import_row (id, import_id, position, passcode, source_name,
                    source_set, source_number, source_rarity, qty_main, qty_extra, qty_side,
                    file_quantity, card_id, unmatched_reason, printing_count,
                    suggested_printing_ids, printing_id, printing_choice, condition,
                    condition_source, language, edition)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
                INSERT_BATCH,
                (statement, row) -> bind(statement, id, row));
    }

    private static void bind(PreparedStatement statement, UUID importId, ImportDraftRow row)
            throws SQLException {
        statement.setObject(1, UUID.randomUUID());
        statement.setObject(2, importId);
        statement.setInt(3, row.position());
        statement.setString(4, row.passcode());
        statement.setString(5, row.sourceName());
        statement.setString(6, row.sourceSet());
        statement.setString(7, row.sourceNumber());
        statement.setString(8, row.sourceRarity());
        statement.setObject(9, row.qtyMain(), Types.INTEGER);
        statement.setObject(10, row.qtyExtra(), Types.INTEGER);
        statement.setObject(11, row.qtySide(), Types.INTEGER);
        statement.setInt(12, row.fileQuantity());
        statement.setObject(13, row.cardId(), Types.OTHER);
        statement.setString(
                14, row.unmatchedReason() == null ? null : row.unmatchedReason().name());
        statement.setInt(15, row.printingCount());
        statement.setArray(
                16,
                statement
                        .getConnection()
                        .createArrayOf("uuid", row.suggestedPrintingIds().toArray()));
        statement.setObject(17, row.printingId(), Types.OTHER);
        statement.setString(18, row.printingChoice() == null ? null : row.printingChoice().name());
        statement.setString(19, row.condition());
        statement.setString(20, row.conditionSource().name());
        statement.setString(21, row.language());
        statement.setString(22, row.edition());
    }

    /** The preview, whoever owns it. */
    public Optional<ImportRecord> find(UUID id) {
        return jdbc.sql("SELECT " + IMPORT_COLUMNS + " FROM inventory_import WHERE id = :id")
                .param("id", id)
                .query(this::mapImport)
                .optional();
    }

    /**
     * The collector's imports that are still of use, newest first: a preview that has not expired,
     * a commit to finish, and results not yet purged.
     */
    public List<ImportRecord> findByOwner(UUID ownerId, Instant now, int limit) {
        return jdbc.sql(
                        "SELECT "
                                + IMPORT_COLUMNS
                                + " FROM inventory_import WHERE owner_id = :ownerId"
                                + " AND NOT (status = 'PENDING' AND expires_at <= :now)"
                                + " ORDER BY created_at DESC, id LIMIT :limit")
                .param("ownerId", ownerId)
                .param("now", Timestamp.from(now))
                .param("limit", limit)
                .query(this::mapImport)
                .list();
    }

    /** The preview, locked until the transaction ends (edits and the chunks of a commit). */
    public Optional<ImportRecord> lock(UUID id) {
        return jdbc.sql(
                        "SELECT "
                                + IMPORT_COLUMNS
                                + " FROM inventory_import WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(this::mapImport)
                .optional();
    }

    /** The counts of a preview, in one query. */
    public ImportSummary summary(UUID id) {
        return jdbc.sql(
                        "SELECT count(*) AS total,"
                                + " count(*) FILTER (WHERE r.card_id IS NULL) AS unmatched,"
                                + " count(*) FILTER (WHERE r.card_id IS NOT NULL AND r.printing_id"
                                + " IS NOT NULL AND "
                                + KEPT
                                + ") AS ready,"
                                + " count(*) FILTER (WHERE r.card_id IS NOT NULL AND r.printing_id"
                                + " IS NULL AND "
                                + KEPT
                                + ") AS to_choose,"
                                + " count(*) FILTER (WHERE r.card_id IS NOT NULL AND NOT "
                                + KEPT
                                + ") AS left_out,"
                                + " COALESCE(sum("
                                + COPIES
                                + ") FILTER (WHERE r.card_id IS NOT NULL AND r.printing_id IS NOT"
                                + " NULL AND "
                                + KEPT
                                + "), 0) AS copies,"
                                + " count(DISTINCT (r.printing_id, r.condition,"
                                + " COALESCE(r.edition, p.edition), COALESCE(r.language,"
                                + " p.language))) FILTER (WHERE r.card_id IS NOT NULL AND"
                                + " r.printing_id IS NOT NULL AND "
                                + KEPT
                                + ") AS items,"
                                + " count(DISTINCT (r.printing_id, r.condition,"
                                + " COALESCE(r.edition, p.edition), COALESCE(r.language,"
                                + " p.language))) FILTER (WHERE r.card_id IS NOT NULL AND"
                                + " r.printing_id IS NOT NULL AND own.printing_id IS NOT NULL AND "
                                + KEPT
                                + ") AS merged_items,"
                                + " count(*) FILTER (WHERE r.card_id IS NOT NULL AND"
                                + " r.condition_source = 'DEFAULT') AS default_conditions,"
                                + " count(DISTINCT r.condition) FILTER (WHERE r.card_id IS NOT"
                                + " NULL AND r.condition_source = 'DEFAULT') AS default_kinds,"
                                + " min(r.condition) FILTER (WHERE r.card_id IS NOT NULL AND"
                                + " r.condition_source = 'DEFAULT') AS default_condition,"
                                + " count(*) FILTER (WHERE "
                                + ASSUMED
                                + ") AS assumed_printings,"
                                + " COALESCE(sum(r.qty_main), 0) AS deck_main,"
                                + " COALESCE(sum(r.qty_extra), 0) AS deck_extra,"
                                + " COALESCE(sum(r.qty_side), 0) AS deck_side"
                                + " FROM inventory_import_row r"
                                + " JOIN inventory_import i ON i.id = r.import_id"
                                + " LEFT JOIN card_printing p ON p.id = r.printing_id"
                                + OWNED_KEYS
                                + " WHERE r.import_id = :id")
                .param("id", id)
                .query(
                        (rs, rowNum) ->
                                new ImportSummary(
                                        rs.getInt("total"),
                                        rs.getInt("ready"),
                                        rs.getInt("to_choose"),
                                        rs.getInt("unmatched"),
                                        rs.getInt("left_out"),
                                        rs.getLong("copies"),
                                        rs.getInt("items"),
                                        rs.getInt("merged_items"),
                                        rs.getInt("default_conditions"),
                                        rs.getInt("default_kinds") == 1
                                                ? rs.getString("default_condition")
                                                : null,
                                        rs.getInt("assumed_printings"),
                                        rs.getLong("deck_main"),
                                        rs.getLong("deck_extra"),
                                        rs.getLong("deck_side")))
                .single();
    }

    // ---------------------------------------------------------------------------------------
    // Rows
    // ---------------------------------------------------------------------------------------

    /** Every row of a preview, in file order. */
    public List<ImportRow> rows(UUID importId) {
        return jdbc.sql(
                        "SELECT "
                                + ROW_COLUMNS
                                + " FROM inventory_import_row r WHERE r.import_id = :id"
                                + " ORDER BY r.position")
                .param("id", importId)
                .query(InventoryImportRepository::mapRow)
                .list();
    }

    /** The rows a chunk of the commit writes, in file order. */
    public List<ImportRow> rowsOfChunk(UUID importId, int chunk) {
        return jdbc.sql(
                        "SELECT "
                                + ROW_COLUMNS
                                + " FROM inventory_import_row r WHERE r.import_id = :id"
                                + " AND r.commit_chunk = :chunk ORDER BY r.position")
                .param("id", importId)
                .param("chunk", chunk)
                .query(InventoryImportRepository::mapRow)
                .list();
    }

    /** One row of a preview. */
    public Optional<ImportRow> row(UUID importId, UUID rowId) {
        return jdbc.sql(
                        "SELECT "
                                + ROW_COLUMNS
                                + " FROM inventory_import_row r WHERE r.import_id = :importId"
                                + " AND r.id = :id")
                .param("importId", importId)
                .param("id", rowId)
                .query(InventoryImportRepository::mapRow)
                .optional();
    }

    /**
     * One page of rows in file order: all of them, those of one status, those whose printing was
     * chosen one way, or both. The rows {@code MOST_RECENT_ASSUMED} keeps are the ones {@link
     * #summary} counts as {@code assumedPrintings}.
     */
    public RowPage rowsPage(
            UUID importId,
            @Nullable RowStatus status,
            @Nullable PrintingChoice choice,
            int page,
            int size) {
        String filter =
                status == null
                        ? ""
                        : switch (status) {
                            case UNMATCHED -> " AND r.card_id IS NULL";
                            case CHOOSE_PRINTING ->
                                    " AND r.card_id IS NOT NULL AND r.printing_id IS NULL";
                            case READY ->
                                    " AND r.card_id IS NOT NULL AND r.printing_id IS NOT NULL";
                        };
        if (choice != null) {
            // A printing that left the catalog leaves its row without one: such a row is to
            // choose again, however its printing had been chosen.
            filter += " AND r.printing_id IS NOT NULL AND r.printing_choice = :choice";
        }
        JdbcClient.StatementSpec count =
                jdbc.sql(
                                "SELECT count(*) FROM inventory_import_row r WHERE r.import_id ="
                                        + " :id"
                                        + filter)
                        .param("id", importId);
        JdbcClient.StatementSpec select =
                jdbc.sql(
                                "SELECT "
                                        + ROW_COLUMNS
                                        + " FROM inventory_import_row r WHERE r.import_id = :id"
                                        + filter
                                        + " ORDER BY r.position LIMIT :limit OFFSET :offset")
                        .param("id", importId)
                        .param("limit", size)
                        .param("offset", (long) page * size);
        if (choice != null) {
            count = count.param("choice", choice.name());
            select = select.param("choice", choice.name());
        }
        long total = count.query(Long.class).single();
        List<ImportRow> rows = select.query(InventoryImportRepository::mapRow).list();
        return new RowPage(rows, total);
    }

    // ---------------------------------------------------------------------------------------
    // Edits (the caller holds the import row, see lock)
    // ---------------------------------------------------------------------------------------

    /** Which sections of a deck count; raises the revision. */
    public void setSections(UUID id, boolean main, boolean extra, boolean side, Instant now) {
        jdbc.sql(
                        """
                        UPDATE inventory_import SET include_main = :main, include_extra = :extra,
                               include_side = :side, revision = revision + 1, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("main", main)
                .param("extra", extra)
                .param("side", side)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Raises the revision after rows changed. */
    public void touch(UUID id, Instant now) {
        jdbc.sql(
                        "UPDATE inventory_import SET revision = revision + 1, updated_at = :now"
                                + " WHERE id = :id")
                .param("id", id)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Stores what the collector decided about one row. */
    public void updateRow(
            UUID rowId,
            @Nullable UUID printingId,
            @Nullable PrintingChoice choice,
            @Nullable String condition,
            ConditionSource conditionSource,
            @Nullable Integer quantity,
            boolean included) {
        jdbc.sql(
                        """
                        UPDATE inventory_import_row SET printing_id = :printingId,
                               printing_choice = :choice, condition = :condition,
                               condition_source = :conditionSource, quantity = :quantity,
                               included = :included
                         WHERE id = :id
                        """)
                .param("id", rowId)
                .param("printingId", printingId, Types.OTHER)
                .param("choice", choice == null ? null : choice.name(), Types.VARCHAR)
                .param("condition", condition, Types.VARCHAR)
                .param("conditionSource", conditionSource.name())
                .param("quantity", quantity, Types.INTEGER)
                .param("included", included)
                .update();
    }

    /**
     * Gives rows that have no printing yet the printing chosen for them ("use the most recent
     * printing"), with how it was chosen ({@code MOST_RECENT}, or {@code MOST_RECENT_ASSUMED} for
     * the plain copy of several versions); returns the rows changed.
     */
    public int choosePrintings(
            UUID importId, Map<UUID, UUID> printingByRow, PrintingChoice choice) {
        if (printingByRow.isEmpty()) {
            return 0;
        }
        List<UUID> rowIds = List.copyOf(printingByRow.keySet());
        return jdbc.sql(
                        """
                        UPDATE inventory_import_row r
                           SET printing_id = v.printing_id, printing_choice = :choice
                          FROM unnest(CAST(:rowIds AS uuid[]), CAST(:printingIds AS uuid[]))
                               AS v (id, printing_id)
                         WHERE r.id = v.id AND r.import_id = :importId AND r.printing_id IS NULL
                        """)
                .param("importId", importId)
                .param("choice", choice.name())
                .param("rowIds", arrayLiteral(rowIds))
                .param(
                        "printingIds",
                        arrayLiteral(rowIds.stream().map(printingByRow::get).toList()))
                .update();
    }

    /**
     * Gives the rows of these cards that still have the condition nobody chose ({@code DEFAULT})
     * another one; returns the rows changed.
     */
    public int setDefaultCondition(UUID importId, Collection<UUID> cardIds, String condition) {
        if (cardIds.isEmpty()) {
            return 0;
        }
        return jdbc.sql(
                        """
                        UPDATE inventory_import_row SET condition = :condition
                         WHERE import_id = :importId AND condition_source = 'DEFAULT'
                           AND card_id = ANY (CAST(:cardIds AS uuid[]))
                           AND condition IS DISTINCT FROM :condition
                        """)
                .param("importId", importId)
                .param("cardIds", arrayLiteral(cardIds))
                .param("condition", condition)
                .update();
    }

    /** The cards of the rows that still have the condition nobody chose. */
    public List<UUID> cardsWithDefaultCondition(UUID importId) {
        return jdbc.sql(
                        "SELECT DISTINCT card_id FROM inventory_import_row WHERE import_id = :id"
                                + " AND condition_source = 'DEFAULT' AND card_id IS NOT NULL")
                .param("id", importId)
                .query(UUID.class)
                .list();
    }

    // ---------------------------------------------------------------------------------------
    // Commit (the caller holds the owner lock of the collector, then the import row)
    // ---------------------------------------------------------------------------------------

    /**
     * Starts the commit: every row that goes in gets the chunk that writes it, and the preview
     * becomes COMMITTING (no edit from here on).
     *
     * @param newItemsByChunk the new items each chunk will create (element 0 = chunk 1): the room
     *     the commit reserves under {@code inventory.items.max} until the chunk is written; {@code
     *     null} when no limit applies to the collector
     * @param copiesNotAdded copies the rows hold that no line can: equal rows together pass the 9
     *     999 copies of one item
     */
    public void freeze(
            UUID importId,
            Map<UUID, Integer> chunkByRow,
            int totalChunks,
            int rows,
            @Nullable List<Integer> newItemsByChunk,
            int copiesNotAdded,
            Instant now) {
        List<UUID> rowIds = List.copyOf(chunkByRow.keySet());
        jdbc.sql(
                        """
                        UPDATE inventory_import_row r SET commit_chunk = v.chunk
                          FROM unnest(CAST(:rowIds AS uuid[]), CAST(:chunks AS int[]))
                               AS v (id, chunk)
                         WHERE r.id = v.id AND r.import_id = :importId
                        """)
                .param("importId", importId)
                .param("rowIds", arrayLiteral(rowIds))
                .param("chunks", arrayLiteral(rowIds.stream().map(chunkByRow::get).toList()))
                .update();
        jdbc.sql(
                        """
                        UPDATE inventory_import SET status = 'COMMITTING',
                               total_chunks = :totalChunks, revision = revision + 1,
                               chunk_new_items = CAST(:newItems AS int[]),
                               result = CAST(:result AS jsonb), updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", importId)
                .param("totalChunks", totalChunks)
                .param(
                        "newItems",
                        newItemsByChunk == null ? null : arrayLiteral(newItemsByChunk),
                        Types.VARCHAR)
                .param("result", json(new ImportResult(0, 0, 0, rows, copiesNotAdded)))
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * Records a written chunk in the transaction that wrote it; the last one makes the import
     * COMMITTED. The expiry moves on: an unfinished commit is not purged under a repeat, and the
     * result of a finished one stays readable for a repeated commit.
     */
    public void chunkDone(
            UUID importId,
            int chunk,
            ImportResult result,
            boolean last,
            Instant now,
            Instant expiresAt) {
        jdbc.sql(
                        """
                        UPDATE inventory_import SET chunks_done = :chunk,
                               result = CAST(:result AS jsonb),
                               status = CASE WHEN :last THEN 'COMMITTED' ELSE status END,
                               committed_at = CASE WHEN :last THEN :now ELSE committed_at END,
                               expires_at = :expiresAt, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", importId)
                .param("chunk", chunk)
                .param("result", json(result))
                .param("last", last)
                .param("now", Timestamp.from(now))
                .param("expiresAt", Timestamp.from(expiresAt))
                .update();
    }

    /**
     * The room the collector's commits in progress still need under {@code inventory.items.max}:
     * the new items of the chunks not yet written of every COMMITTING import (index {@code
     * ix_inventory_import_committing}). Each chunk is written and recorded in one transaction, so a
     * reader sees an item either here or in the inventory, never in both and never in neither.
     */
    public long reservedItems(UUID ownerId) {
        return jdbc.sql(
                        """
                        SELECT COALESCE(sum(c.items), 0)
                          FROM inventory_import i
                          CROSS JOIN LATERAL unnest(i.chunk_new_items) WITH ORDINALITY
                               AS c (items, chunk)
                         WHERE i.owner_id = :ownerId AND i.status = 'COMMITTING'
                           AND c.chunk > i.chunks_done
                        """)
                .param("ownerId", ownerId)
                .query(Long.class)
                .single();
    }

    // ---------------------------------------------------------------------------------------
    // Removal
    // ---------------------------------------------------------------------------------------

    /**
     * The upload lock of a collector ({@code pg_advisory_xact_lock}, held until the transaction
     * ends): two uploads of one collector replace the open preview one after the other, so there is
     * never more than one. It is not the owner lock of the inventory writes: an upload writes no
     * binder and no item, and never makes one of those writes wait.
     */
    public void lockUploadsOf(UUID ownerId) {
        jdbc.sql(
                        "SELECT pg_advisory_xact_lock(hashtextextended('inventory-import-upload:'"
                                + " || :ownerId, 0))")
                .param("ownerId", ownerId.toString())
                .query(rs -> {});
    }

    /** Deletes one preview (its rows go with it). */
    public void delete(UUID id) {
        jdbc.sql("DELETE FROM inventory_import WHERE id = :id").param("id", id).update();
    }

    /**
     * Deletes the collector's previews that no commit has started: a new upload replaces them. A
     * preview another transaction holds (an edit being saved, a commit that starts) is waited for:
     * the edit is then lost with its preview, and a preview whose commit started is no longer
     * PENDING and stays. The caller holds the collector's upload lock ({@link #lockUploadsOf}).
     */
    public int deletePendingOf(UUID ownerId) {
        return jdbc.sql(
                        """
                        DELETE FROM inventory_import
                         WHERE id IN (SELECT id FROM inventory_import
                                       WHERE owner_id = :ownerId AND status = 'PENDING'
                                       ORDER BY id FOR UPDATE)
                        """)
                .param("ownerId", ownerId)
                .update();
    }

    /** Deletes every preview of a collector (account purge). */
    public int deleteAllOf(UUID ownerId) {
        return jdbc.sql("DELETE FROM inventory_import WHERE owner_id = :ownerId")
                .param("ownerId", ownerId)
                .update();
    }

    /**
     * Deletes the previews that have expired, at most {@code limit} per call: pending previews and
     * finished imports past {@code expires_at}, and commits nobody finished since {@code
     * unfinishedBefore}. A preview another transaction holds is left to the next run.
     */
    public int purge(Instant now, Instant unfinishedBefore, int limit) {
        return jdbc.sql(
                        """
                        DELETE FROM inventory_import
                         WHERE id IN (SELECT id FROM inventory_import
                                       WHERE (status <> 'COMMITTING' AND expires_at <= :now)
                                          OR (status = 'COMMITTING'
                                              AND expires_at <= :unfinishedBefore)
                                       ORDER BY expires_at, id
                                       LIMIT :limit FOR UPDATE SKIP LOCKED)
                        """)
                .param("now", Timestamp.from(now))
                .param("unfinishedBefore", Timestamp.from(unfinishedBefore))
                .param("limit", limit)
                .update();
    }

    // ---------------------------------------------------------------------------------------
    // Mapping
    // ---------------------------------------------------------------------------------------

    /**
     * A PostgreSQL array literal of ids or numbers ({@code {a,b,c}}), cast in the statement: one
     * parameter however many values, where an {@code IN} list would be one parameter each.
     */
    private static String arrayLiteral(Collection<?> values) {
        StringBuilder literal = new StringBuilder("{");
        for (Object value : values) {
            if (literal.length() > 1) {
                literal.append(',');
            }
            literal.append(value);
        }
        return literal.append('}').toString();
    }

    private String json(ImportResult result) {
        return jsonMapper.writeValueAsString(result);
    }

    private ImportRecord mapImport(ResultSet rs, int rowNum) throws SQLException {
        Timestamp committedAt = rs.getTimestamp("committed_at");
        int totalChunks = rs.getInt("total_chunks");
        boolean started = !rs.wasNull();
        return new ImportRecord(
                rs.getObject("id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                ImportSource.valueOf(rs.getString("source")),
                ImportStatus.valueOf(rs.getString("status")),
                rs.getBoolean("include_main"),
                rs.getBoolean("include_extra"),
                rs.getBoolean("include_side"),
                rs.getInt("ignored_lines"),
                rs.getLong("revision"),
                started ? totalChunks : null,
                rs.getInt("chunks_done"),
                integers(rs.getArray("chunk_new_items")),
                result(rs.getString("result")),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("expires_at").toInstant(),
                committedAt == null ? null : committedAt.toInstant());
    }

    private ImportResult result(@Nullable String json) {
        if (json == null || json.isBlank()) {
            return ImportResult.NONE;
        }
        try {
            return jsonMapper.readValue(json, ImportResult.class);
        } catch (JacksonException e) {
            return ImportResult.NONE;
        }
    }

    private static ImportRow mapRow(ResultSet rs, int rowNum) throws SQLException {
        String reason = rs.getString("unmatched_reason");
        String choice = rs.getString("printing_choice");
        return new ImportRow(
                rs.getObject("id", UUID.class),
                rs.getObject("import_id", UUID.class),
                rs.getInt("position"),
                rs.getString("passcode"),
                rs.getString("source_name"),
                rs.getString("source_set"),
                rs.getString("source_number"),
                rs.getString("source_rarity"),
                nullableInt(rs, "qty_main"),
                nullableInt(rs, "qty_extra"),
                nullableInt(rs, "qty_side"),
                rs.getInt("file_quantity"),
                nullableInt(rs, "quantity"),
                rs.getObject("card_id", UUID.class),
                reason == null ? null : UnmatchedReason.valueOf(reason),
                rs.getInt("printing_count"),
                uuids(rs.getArray("suggested_printing_ids")),
                rs.getObject("printing_id", UUID.class),
                choice == null ? null : PrintingChoice.valueOf(choice),
                rs.getString("condition"),
                ConditionSource.valueOf(rs.getString("condition_source")),
                rs.getString("language"),
                rs.getString("edition"),
                rs.getBoolean("included"),
                nullableInt(rs, "commit_chunk"));
    }

    private static @Nullable List<Integer> integers(@Nullable Array array) throws SQLException {
        if (array == null) {
            return null;
        }
        List<Integer> values = new ArrayList<>();
        for (Object value : (Object[]) array.getArray()) {
            values.add(((Number) value).intValue());
        }
        return values;
    }

    private static List<UUID> uuids(@Nullable Array array) throws SQLException {
        List<UUID> ids = new ArrayList<>();
        if (array == null) {
            return ids;
        }
        for (Object value : (Object[]) array.getArray()) {
            if (value instanceof UUID id) {
                ids.add(id);
            }
        }
        return ids;
    }

    private static @Nullable Integer nullableInt(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    /** A page of rows and the total. */
    public record RowPage(List<ImportRow> rows, long total) {}
}
