package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.billing.domain.LimitDecision;
import com.orenjitrade.api.billing.domain.LimitReachedException;
import com.orenjitrade.api.billing.domain.Limits;
import com.orenjitrade.api.binders.domain.BinderService;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.CatalogCardRef;
import com.orenjitrade.api.cards.domain.CatalogPrintingRef;
import com.orenjitrade.api.cards.domain.CatalogService;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameService;
import com.orenjitrade.api.games.domain.GameView;
import com.orenjitrade.api.inventory.domain.InventoryChanges.ImportLine;
import com.orenjitrade.api.inventory.domain.InventoryChanges.ImportOutcome;
import com.orenjitrade.api.inventory.domain.InventoryChanges.MergeKey;
import com.orenjitrade.api.inventory.domain.InventoryChanges.OwnedCopies;
import com.orenjitrade.api.inventory.domain.InventoryService;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.BulkAction;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.BulkChange;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.RowChange;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.RowPatch;
import com.orenjitrade.api.inventory.infra.InventoryImportRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The inventory import (stage S5, owner spec 2026-10-08 section 6): a YDK deck file or a Collectr
 * CSV export becomes a preview stored on the server, the collector edits it, and a commit writes it
 * into the inventory.
 *
 * <p><b>Preview.</b> The upload is parsed and matched before anything is stored (grouped catalog
 * lookups, never one query per row). The preview belongs to its collector: every other caller gets
 * 404, never a hint that it exists. It expires ({@code inventory.import.preview_ttl_minutes}) and a
 * job purges it. A new upload replaces the collector's previews no commit has started.
 *
 * <p><b>Commit.</b> Idempotent: a second commit of the same preview, also one that arrives while
 * the first is running, writes nothing twice and answers with the same result. Rows that are equal
 * (same printing, condition, edition and language) become one line; a line whose equal item the
 * collector already has, and keeps private, raises that item's quantity; any other line creates a
 * PRIVATE unfiled item (an item the collector shows is never raised: nothing an import adds is
 * public). The freemium limit {@code inventory.items.max} is checked for the whole import before
 * the first item is written, and the new items of the chunks still to write stay reserved under it
 * ({@code inventory_import.chunk_new_items}) until each chunk is in: no other write of the
 * collector takes their room meanwhile.
 *
 * <p><b>Locks</b> (docs/database/schema.md, "A new bulk write"). The plan (which rows go in, as
 * which lines, in which chunk) is computed before any transaction. Then one transaction per chunk
 * of at most {@value InventoryService#BULK_MAX} lines, one after the other: the owner lock of the
 * collector first, then the import row, then {@link InventoryService#importLines} (the binders and
 * the existing items in ascending id, the writes, the reconciliation), and the chunk is recorded as
 * done in that same transaction. A commit that dies between two chunks leaves the import
 * COMMITTING: the next commit continues after the last chunk recorded.
 *
 * <p>Nothing of a file is ever logged: only ids and counts.
 */
@Service
public class InventoryImportService {

    /** The provider whose card ids are the passcodes of a YDK file. */
    public static final String PASSCODE_PROVIDER = "ygoprodeck";

    /** How long a commit nobody finished is kept before the purge removes it. */
    static final Duration UNFINISHED_RETENTION = Duration.ofDays(7);

    static final String NOT_FOUND = "Import not found";
    static final String ROW_NOT_FOUND = "Import row not found";
    static final int PLAN_ATTEMPTS = 3;
    static final int LIST_MAX = 20;

    private static final Logger log = LoggerFactory.getLogger(InventoryImportService.class);

    private final InventoryImportRepository imports;
    private final InventoryImportSettings settings;
    private final CatalogService catalog;
    private final GameService games;
    private final InventoryService inventory;
    private final BinderService binders;
    private final Limits limits;
    private final TimeProvider timeProvider;
    private final TransactionTemplate transaction;

    public InventoryImportService(
            InventoryImportRepository imports,
            InventoryImportSettings settings,
            CatalogService catalog,
            GameService games,
            InventoryService inventory,
            BinderService binders,
            Limits limits,
            TimeProvider timeProvider,
            PlatformTransactionManager transactionManager) {
        this.imports = imports;
        this.settings = settings;
        this.catalog = catalog;
        this.games = games;
        this.inventory = inventory;
        this.binders = binders;
        this.limits = limits;
        this.timeProvider = timeProvider;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    // ---------------------------------------------------------------------------------------
    // Preview
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /inventory/imports}: parses and matches a file and stores the preview.
     *
     * @param gameSlug CSV only: the game of rows that name none ({@code null}: any active game)
     * @throws ApiException 413 above the size limit, 415 for a file that is not UTF-8 text, 400 for
     *     a file that cannot be imported (too many lines or rows, no card name column, no card) or
     *     an unknown {@code game}
     */
    public ImportView preview(
            UUID ownerId, ImportSource source, byte[] bytes, @Nullable String gameSlug) {
        InventoryImportSettings.Values limit = settings.current();
        List<ImportDraftRow> rows;
        int ignored;
        try {
            if (source == ImportSource.YDK) {
                YdkParser.Deck deck = YdkParser.parse(bytes, limit.ydkLimits());
                rows = matchDeck(deck);
                ignored = deck.ignoredLines();
            } else {
                @Nullable String game = defaultGame(gameSlug);
                CollectrCsvParser.Sheet sheet = CollectrCsvParser.parse(bytes, limit.csvLimits());
                rows = matchSheet(sheet, game);
                ignored = sheet.blankRows();
            }
        } catch (ImportFileException e) {
            throw refusal(e);
        }
        UUID id = UUID.randomUUID();
        Instant now = timeProvider.now();
        int ignoredLines = ignored;
        List<ImportDraftRow> drafts = rows;
        ImportView view =
                Objects.requireNonNull(
                        transaction.execute(
                                status -> {
                                    // One upload of a collector at a time: the second one finds,
                                    // and replaces, the preview of the first.
                                    imports.lockUploadsOf(ownerId);
                                    imports.deletePendingOf(ownerId);
                                    imports.insert(
                                            id,
                                            ownerId,
                                            source,
                                            ignoredLines,
                                            drafts,
                                            now,
                                            now.plus(limit.previewTtl()));
                                    // Read in the transaction that stored it: the next upload of
                                    // this collector replaces it the moment this one commits.
                                    return view(require(ownerId, id));
                                }));
        log.info(
                "Inventory import preview owner={} import={} source={} rows={} ready={}"
                        + " toChoose={} unmatched={}",
                ownerId,
                id,
                source,
                view.summary().rows(),
                view.summary().ready(),
                view.summary().toChoose(),
                view.summary().unmatched());
        return view;
    }

    /**
     * {@code GET /inventory/imports}: the caller's imports that are still of use, newest first (the
     * open preview, a commit to finish, recent results): what an app that was closed in the middle
     * of an import picks up again.
     */
    public List<ImportView> list(UUID ownerId) {
        return imports.findByOwner(ownerId, timeProvider.now(), LIST_MAX).stream()
                .map(this::view)
                .toList();
    }

    /** {@code GET /inventory/imports/{id}}: the caller's preview (404 otherwise, 410 expired). */
    public ImportView get(UUID ownerId, UUID importId) {
        return view(usable(require(ownerId, importId)));
    }

    /** {@code GET /inventory/imports/{id}/rows}: one page of rows in file order. */
    public PageResponse<ImportRowView> rows(
            UUID ownerId, UUID importId, @Nullable RowStatus status, int page, int size) {
        ImportRecord record = usable(require(ownerId, importId));
        InventoryImportRepository.RowPage rows = imports.rowsPage(importId, status, page, size);
        return PageResponse.of(rowViews(record, rows.rows()), page, size, rows.total());
    }

    // ---------------------------------------------------------------------------------------
    // Edits
    // ---------------------------------------------------------------------------------------

    /**
     * {@code PATCH /inventory/imports/{id}}: which sections of a deck count ({@code null} keeps a
     * section as it is). 400 for a CSV import.
     */
    public ImportView setSections(
            UUID ownerId,
            UUID importId,
            @Nullable Boolean main,
            @Nullable Boolean extra,
            @Nullable Boolean side) {
        transaction.executeWithoutResult(
                status -> {
                    ImportRecord record = editable(ownerId, importId);
                    if (record.source() != ImportSource.YDK) {
                        throw ApiException.validation(
                                "Validation failed",
                                List.of(
                                        new ProblemFieldError(
                                                "includeMain",
                                                "only a deck file has sections to leave out")));
                    }
                    imports.setSections(
                            importId,
                            main != null ? main : record.includeMain(),
                            extra != null ? extra : record.includeExtra(),
                            side != null ? side : record.includeSide(),
                            timeProvider.now());
                });
        return view(require(ownerId, importId));
    }

    /**
     * {@code PATCH /inventory/imports/{id}/rows/{rowId}}: the printing, the condition, the copies
     * and whether the row stays in. A row that fits nothing cannot be changed (409).
     */
    public RowChange updateRow(UUID ownerId, UUID importId, UUID rowId, RowPatch patch) {
        transaction.executeWithoutResult(
                status -> {
                    editable(ownerId, importId);
                    ImportRow row =
                            imports.row(importId, rowId)
                                    .orElseThrow(() -> ApiException.notFound(ROW_NOT_FOUND));
                    @Nullable UUID cardId = row.cardId();
                    if (cardId == null) {
                        throw ApiException.conflict(
                                "This row fits nothing in the catalog: it cannot be changed or"
                                        + " imported");
                    }
                    List<ProblemFieldError> errors = new ArrayList<>();
                    @Nullable UUID printingId = row.printingId();
                    @Nullable PrintingChoice choice = row.printingChoice();
                    if (patch.has("printingId")) {
                        printingId = patch.printingId();
                        choice = printingId == null ? null : PrintingChoice.MANUAL;
                        if (printingId != null && !isPrintingOf(printingId, cardId)) {
                            errors.add(
                                    new ProblemFieldError(
                                            "printingId", "is not a printing of this row's card"));
                        }
                    }
                    @Nullable String condition = row.condition();
                    ConditionSource conditionSource = row.conditionSource();
                    if (patch.has("condition") && patch.condition() != null) {
                        condition = patch.condition().trim().toUpperCase(Locale.ROOT);
                        conditionSource = ConditionSource.EDITED;
                        List<String> conditions = conditionsOf(List.of(cardId)).get(cardId);
                        if (!isCondition(condition, conditions)) {
                            errors.add(conditionError(conditions));
                        }
                    }
                    @Nullable Integer quantity = row.quantity();
                    if (patch.has("quantity")) {
                        quantity = patch.quantity();
                        if (quantity != null
                                && (quantity < 1 || quantity > InventoryService.QUANTITY_MAX)) {
                            errors.add(
                                    new ProblemFieldError(
                                            "quantity", "must be between 1 and 9999"));
                        }
                    }
                    boolean included =
                            patch.has("included") && patch.included() != null
                                    ? patch.included()
                                    : row.included();
                    if (!errors.isEmpty()) {
                        throw ApiException.validation("Validation failed", errors);
                    }
                    imports.updateRow(
                            rowId,
                            printingId,
                            choice,
                            condition,
                            conditionSource,
                            quantity,
                            included);
                    imports.touch(importId, timeProvider.now());
                });
        ImportRecord record = require(ownerId, importId);
        ImportRow row =
                imports.row(importId, rowId)
                        .orElseThrow(() -> ApiException.notFound(ROW_NOT_FOUND));
        return new RowChange(rowViews(record, List.of(row)).get(0), view(record));
    }

    /** {@code POST /inventory/imports/{id}/bulk}: one action on every row it applies to. */
    public BulkChange bulk(
            UUID ownerId, UUID importId, BulkAction action, @Nullable String condition) {
        int[] counts =
                transaction.execute(
                        status -> {
                            editable(ownerId, importId);
                            int[] changed =
                                    switch (action) {
                                        case USE_MOST_RECENT_PRINTING -> chooseMostRecent(importId);
                                        case SET_CONDITION ->
                                                new int[] {setCondition(importId, condition), 0, 0};
                                    };
                            if (changed[0] > 0) {
                                imports.touch(importId, timeProvider.now());
                            }
                            return changed;
                        });
        return new BulkChange(
                counts == null ? 0 : counts[0],
                counts == null ? 0 : counts[1],
                counts == null ? 0 : counts[2],
                view(require(ownerId, importId)));
    }

    /**
     * Gives every row without a printing the most recent printing of its card.
     *
     * @return the rows changed; of those, the rows that got the plain copy of several versions of
     *     their card in its most recent set; and the rows left as they are because nothing decides
     *     between the printings of that most recent date
     */
    private int[] chooseMostRecent(UUID importId) {
        List<ImportRow> unchosen =
                imports.rows(importId).stream()
                        .filter(row -> row.status() == RowStatus.CHOOSE_PRINTING)
                        .toList();
        Map<UUID, List<CatalogPrintingRef>> printings =
                catalog.printingRefsOfCards(
                        unchosen.stream().map(ImportRow::cardId).filter(Objects::nonNull).toList());
        Map<UUID, UUID> decided = new LinkedHashMap<>();
        Map<UUID, UUID> assumed = new LinkedHashMap<>();
        int undecided = 0;
        for (ImportRow row : unchosen) {
            List<CatalogPrintingRef> ofCard = printings.getOrDefault(row.cardId(), List.of());
            ImportMatcher.MostRecent recent =
                    ImportMatcher.mostRecent(ofCard, row.suggestedPrintingIds());
            @Nullable UUID printingId = recent.printingId();
            if (printingId != null) {
                (recent.assumed() ? assumed : decided).put(row.id(), printingId);
            } else if (!ofCard.isEmpty()) {
                undecided++;
            }
        }
        int plain = imports.choosePrintings(importId, assumed, PrintingChoice.MOST_RECENT_ASSUMED);
        int dated = imports.choosePrintings(importId, decided, PrintingChoice.MOST_RECENT);
        return new int[] {plain + dated, plain, undecided};
    }

    private int setCondition(UUID importId, @Nullable String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(new ProblemFieldError("condition", "is required for SET_CONDITION")));
        }
        String condition = raw.trim().toUpperCase(Locale.ROOT);
        Map<UUID, List<String>> conditions =
                conditionsOf(imports.cardsWithDefaultCondition(importId));
        List<UUID> cards =
                conditions.entrySet().stream()
                        .filter(entry -> isCondition(condition, entry.getValue()))
                        .map(Map.Entry::getKey)
                        .toList();
        if (cards.isEmpty() && !conditions.isEmpty()) {
            throw ApiException.validation(
                    "Validation failed",
                    List.of(conditionError(conditions.values().iterator().next())));
        }
        return imports.setDefaultCondition(importId, cards, condition);
    }

    /** {@code DELETE /inventory/imports/{id}}: discards a preview no commit has started. */
    public void discard(UUID ownerId, UUID importId) {
        transaction.executeWithoutResult(
                status -> {
                    ImportRecord record =
                            imports.lock(importId)
                                    .filter(found -> found.ownerId().equals(ownerId))
                                    .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
                    if (record.status() != ImportStatus.PENDING) {
                        throw alreadyCommitted(record);
                    }
                    imports.delete(importId);
                });
    }

    // ---------------------------------------------------------------------------------------
    // Commit
    // ---------------------------------------------------------------------------------------

    /**
     * {@code POST /inventory/imports/{id}/commit}.
     *
     * @param skipUnresolved leave out the rows that still need a printing instead of refusing
     * @return the import, COMMITTED, with its result
     * @throws ApiException 404 for another collector's import, 410 once a preview expired, 409
     *     {@code IMPORT_ROWS_UNRESOLVED} / {@code IMPORT_EMPTY}, 429 {@code LIMIT_REACHED} beyond
     *     {@code inventory.items.max} (nothing is written; a later chunk answers it only when the
     *     collector deleted a card the import was going to raise and gave its room away: the chunks
     *     written stay, a repeated commit continues once there is room)
     */
    public ImportView commit(UUID ownerId, UUID importId, boolean skipUnresolved) {
        Duration ttl = settings.current().previewTtl();
        for (int attempt = 0; attempt < PLAN_ATTEMPTS; attempt++) {
            ImportRecord record = require(ownerId, importId);
            if (record.status() == ImportStatus.PENDING) {
                Plan plan = plan(usable(record), skipUnresolved);
                if (!writeFirstChunk(ownerId, plan, ttl)) {
                    continue; // the preview changed since it was planned: plan again
                }
            }
            if (writeRemainingChunks(ownerId, importId, ttl)) {
                ImportView done = view(require(ownerId, importId));
                log.info(
                        "Inventory import committed owner={} import={} created={} merged={}"
                                + " copies={}",
                        ownerId,
                        importId,
                        done.record().result().itemsCreated(),
                        done.record().result().itemsMerged(),
                        done.record().result().copiesAdded());
                return done;
            }
        }
        throw ApiException.conflict("The import changed while it was committed: try again");
    }

    /**
     * What a commit writes, computed before any transaction.
     *
     * @param revision the revision of the preview the plan was made from
     * @param lines every line, in file order
     * @param chunkByRow the chunk (from 1) that writes each row that goes in
     * @param copiesNotAdded copies of those rows no line holds (equal rows above 9 999 together)
     */
    private record Plan(
            UUID importId,
            long revision,
            List<ImportLine> lines,
            Map<UUID, Integer> chunkByRow,
            int copiesNotAdded) {

        int totalChunks() {
            return (lines.size() + InventoryService.BULK_MAX - 1) / InventoryService.BULK_MAX;
        }

        /** The lines of each chunk that become a new item, given the keys that have no item. */
        List<Integer> newItemsByChunk(Set<MergeKey> newKeys) {
            List<Integer> counts = new ArrayList<>();
            for (int number = 1; number <= totalChunks(); number++) {
                counts.add(
                        (int)
                                chunk(number).stream()
                                        .filter(line -> newKeys.contains(line.key()))
                                        .count());
            }
            return counts;
        }

        List<ImportLine> chunk(int number) {
            int from = (number - 1) * InventoryService.BULK_MAX;
            return lines.subList(from, Math.min(lines.size(), from + InventoryService.BULK_MAX));
        }
    }

    private Plan plan(ImportRecord record, boolean skipUnresolved) {
        List<ImportRow> kept =
                imports.rows(record.id()).stream()
                        .filter(
                                row ->
                                        row.cardId() != null
                                                && row.included()
                                                && row.inScope(record)
                                                && row.effectiveQuantity(record) >= 1)
                        .toList();
        Lines lines = lines(record, kept);
        if (lines.unresolved() > 0 && !skipUnresolved) {
            throw new ApiException(
                            ErrorCode.IMPORT_ROWS_UNRESOLVED,
                            lines.unresolved() == 1
                                    ? "1 row still needs a printing"
                                    : lines.unresolved() + " rows still need a printing")
                    .withProperty("unresolved", lines.unresolved());
        }
        if (lines.lines().isEmpty()) {
            throw new ApiException(
                    ErrorCode.IMPORT_EMPTY, "No row of this import is ready to be imported");
        }
        Map<UUID, Integer> chunkByRow = new LinkedHashMap<>();
        int index = 0;
        for (List<UUID> rowIds : lines.rowsByLine()) {
            int chunk = index / InventoryService.BULK_MAX + 1;
            rowIds.forEach(rowId -> chunkByRow.put(rowId, chunk));
            index++;
        }
        return new Plan(
                record.id(), record.revision(), lines.lines(), chunkByRow, lines.copiesNotAdded());
    }

    /**
     * The lines of some rows: rows that are equal (printing, condition, edition, language) are one
     * line with their copies together.
     *
     * @param lines the lines, in the order of their first row
     * @param rowsByLine the rows of each line
     * @param unresolved rows without a printing the catalog still has for their card
     * @param copiesNotAdded copies of the rows no line holds: equal rows above 9 999 together
     */
    private record Lines(
            List<ImportLine> lines,
            List<List<UUID>> rowsByLine,
            int unresolved,
            int copiesNotAdded) {}

    private Lines lines(ImportRecord record, List<ImportRow> rows) {
        Map<UUID, CatalogPrintingRef> printings =
                catalog.printingRefs(
                        rows.stream().map(ImportRow::printingId).filter(Objects::nonNull).toList());
        Map<String, GameSchema> schemas = schemas();
        Map<MergeKey, ImportLine> lines = new LinkedHashMap<>();
        Map<MergeKey, List<UUID>> rowIds = new LinkedHashMap<>();
        int unresolved = 0;
        long asked = 0;
        for (ImportRow row : rows) {
            @Nullable CatalogPrintingRef printing =
                    row.printingId() == null ? null : printings.get(row.printingId());
            if (printing == null || !printing.cardId().equals(row.cardId())) {
                unresolved++;
                continue;
            }
            asked += row.effectiveQuantity(record);
            @Nullable GameSchema schema = schemas.get(printing.game());
            List<String> conditions = schema == null ? List.of() : schema.conditions();
            String condition =
                    row.condition() != null && isCondition(row.condition(), conditions)
                            ? row.condition()
                            : ImportMatcher.defaultCondition(schema);
            ImportLine line =
                    new ImportLine(
                            printing.id(),
                            condition,
                            row.language() != null ? row.language() : printing.language(),
                            row.edition() != null ? row.edition() : printing.edition(),
                            printing.finish(),
                            row.effectiveQuantity(record));
            lines.merge(
                    line.key(),
                    line,
                    (first, more) ->
                            new ImportLine(
                                    first.printingId(),
                                    first.condition(),
                                    first.language(),
                                    first.edition(),
                                    first.finish(),
                                    Math.min(
                                            InventoryService.QUANTITY_MAX,
                                            first.quantity() + more.quantity())));
            rowIds.computeIfAbsent(line.key(), key -> new ArrayList<>()).add(row.id());
        }
        long held = lines.values().stream().mapToLong(ImportLine::quantity).sum();
        return new Lines(
                List.copyOf(lines.values()),
                List.copyOf(rowIds.values()),
                unresolved,
                (int) Math.max(0, asked - held));
    }

    /**
     * The transaction that starts a commit: the limit for the whole import, the chunk of every row,
     * the room the chunks still to write reserve, and the first chunk. Nothing is written when any
     * of it fails.
     *
     * @return {@code false} when the preview is no longer the one that was planned (an edit or
     *     another commit came first): the caller reads it again
     */
    private boolean writeFirstChunk(UUID ownerId, Plan plan, Duration ttl) {
        try {
            Boolean written =
                    transaction.execute(
                            status -> {
                                // The owner lock, before any row and before any other lock.
                                binders.lockOwners(List.of(ownerId));
                                ImportRecord record =
                                        imports.lock(plan.importId())
                                                .filter(found -> found.ownerId().equals(ownerId))
                                                .orElseThrow(
                                                        () -> ApiException.notFound(NOT_FOUND));
                                if (record.status() != ImportStatus.PENDING
                                        || record.revision() != plan.revision()) {
                                    return false;
                                }
                                Instant now = timeProvider.now();
                                usable(record);
                                @Nullable List<Integer> reserved = requireRoom(ownerId, plan);
                                imports.freeze(
                                        plan.importId(),
                                        plan.chunkByRow(),
                                        plan.totalChunks(),
                                        plan.chunkByRow().size(),
                                        reserved,
                                        plan.copiesNotAdded(),
                                        now);
                                ImportOutcome outcome =
                                        inventory.importLines(
                                                ownerId,
                                                plan.chunk(1),
                                                reserved == null ? null : reserved.get(0));
                                imports.chunkDone(
                                        plan.importId(),
                                        1,
                                        new ImportResult(
                                                outcome.created(),
                                                outcome.merged(),
                                                outcome.copies(),
                                                plan.chunkByRow().size(),
                                                plan.copiesNotAdded() + outcome.notAdded()),
                                        plan.totalChunks() == 1,
                                        now,
                                        now.plus(ttl));
                                return true;
                            });
            return Boolean.TRUE.equals(written);
        } catch (DataIntegrityViolationException e) {
            throw catalogChanged();
        }
    }

    /**
     * Writes the chunks after the last one recorded, each in its own transaction. A chunk another
     * commit wrote meanwhile is skipped: the owner lock lets one commit at a time look.
     *
     * @return {@code false} when the import is not being committed (the caller plans it)
     */
    private boolean writeRemainingChunks(UUID ownerId, UUID importId, Duration ttl) {
        while (true) {
            ImportRecord record = require(ownerId, importId);
            if (record.status() == ImportStatus.COMMITTED) {
                return true;
            }
            @Nullable Integer total = record.totalChunks();
            if (record.status() != ImportStatus.COMMITTING || total == null) {
                return false;
            }
            int chunk = record.chunksDone() + 1;
            // The rows are frozen since the commit started: read and validated out of the lock.
            List<ImportLine> lines = lines(record, imports.rowsOfChunk(importId, chunk)).lines();
            try {
                transaction.executeWithoutResult(
                        status -> {
                            binders.lockOwners(List.of(ownerId));
                            ImportRecord locked =
                                    imports.lock(importId)
                                            .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
                            if (locked.status() != ImportStatus.COMMITTING
                                    || locked.chunksDone() != chunk - 1) {
                                return; // another commit wrote this chunk
                            }
                            Instant now = timeProvider.now();
                            ImportOutcome outcome =
                                    inventory.importLines(
                                            ownerId, lines, locked.plannedNewItems(chunk));
                            imports.chunkDone(
                                    importId,
                                    chunk,
                                    locked.result()
                                            .plus(
                                                    outcome.created(),
                                                    outcome.merged(),
                                                    outcome.copies(),
                                                    outcome.notAdded()),
                                    chunk == total,
                                    now,
                                    now.plus(ttl));
                        });
            } catch (DataIntegrityViolationException e) {
                throw catalogChanged();
            }
        }
    }

    /**
     * Refuses an import that would take the inventory beyond {@code inventory.items.max}, as the
     * limit answers everywhere (429 {@code LIMIT_REACHED}), with the items it would add as {@code
     * requested}. Counted for the whole import, under the owner lock, before the first item. The
     * usage it is compared with holds the collector's live items and the room their other commits
     * in progress have reserved.
     *
     * @return the new items each chunk will create, which the commit reserves from here on; {@code
     *     null} when no limit applies to the collector (nothing to reserve)
     */
    private @Nullable List<Integer> requireRoom(UUID ownerId, Plan plan) {
        LimitDecision decision = limits.check(ownerId, InventoryService.INVENTORY_ITEMS_MAX);
        @Nullable Integer max = decision.limit();
        if (max == null) {
            return null;
        }
        Set<MergeKey> newKeys = inventory.newKeysOf(ownerId, plan.lines());
        long adding = newKeys.size();
        long used = decision.used() == null ? 0 : decision.used();
        if (adding > 0 && used + adding > max) {
            throw new LimitReachedException(decision).withProperty("requested", adding);
        }
        return plan.newItemsByChunk(newKeys);
    }

    // ---------------------------------------------------------------------------------------
    // Purge
    // ---------------------------------------------------------------------------------------

    /**
     * The job {@code inventory-import-purge}: deletes expired previews and results, and commits
     * nobody finished for {@link #UNFINISHED_RETENTION}; at most {@code limit} per call.
     */
    public int purgeExpired(int limit) {
        Instant now = timeProvider.now();
        Integer removed =
                transaction.execute(
                        status -> imports.purge(now, now.minus(UNFINISHED_RETENTION), limit));
        return removed == null ? 0 : removed;
    }

    /**
     * Deletes every import of a collector (account purge). The caller holds the owner lock of the
     * collector, as a commit does before it takes an import row.
     */
    public int purge(UUID ownerId) {
        Integer removed = transaction.execute(status -> imports.deleteAllOf(ownerId));
        return removed == null ? 0 : removed;
    }

    // ---------------------------------------------------------------------------------------
    // Matching
    // ---------------------------------------------------------------------------------------

    private List<ImportDraftRow> matchDeck(YdkParser.Deck deck) {
        List<String> passcodes = ImportMatcher.passcodes(deck);
        Map<String, CatalogCardRef> byPasscode =
                catalog.cardsByExternalIds(PASSCODE_PROVIDER, passcodes);
        List<String> unknown =
                passcodes.stream().filter(code -> !byPasscode.containsKey(code)).toList();
        Map<String, CatalogCardRef> byArtwork =
                unknown.isEmpty()
                        ? Map.of()
                        : catalog.cardsByProviderImageIds(PASSCODE_PROVIDER, unknown);
        Set<UUID> cardIds = new LinkedHashSet<>();
        byPasscode.values().forEach(card -> cardIds.add(card.id()));
        byArtwork.values().forEach(card -> cardIds.add(card.id()));
        return ImportMatcher.ydk(
                deck,
                new ImportMatcher.Catalog(
                        byPasscode,
                        byArtwork,
                        Map.of(),
                        Map.of(),
                        catalog.printingRefsOfCards(cardIds),
                        schemas(),
                        Map.of()));
    }

    private List<ImportDraftRow> matchSheet(
            CollectrCsvParser.Sheet sheet, @Nullable String defaultGame) {
        Set<String> names = new LinkedHashSet<>();
        Set<String> codes = new LinkedHashSet<>();
        for (CollectrCsvParser.Row row : sheet.rows()) {
            names.addAll(ImportMatcher.nameKeys(row.name()));
            ImportMatcher.printingCode(row.number()).ifPresent(codes::add);
        }
        Map<String, List<CatalogCardRef>> byName = catalog.cardsByNormalisedNames(names);
        Map<String, List<CatalogPrintingRef>> byCode = catalog.printingRefsByCodes(codes);
        Set<UUID> cardIds = new LinkedHashSet<>();
        byName.values().forEach(cards -> cards.forEach(card -> cardIds.add(card.id())));
        byCode.values().forEach(printings -> printings.forEach(ref -> cardIds.add(ref.cardId())));
        Map<String, String> gameKeys = new HashMap<>();
        for (GameView game : games.active()) {
            gameKeys.put(CollectrCsvFormat.key(game.slug()), game.slug());
            gameKeys.put(CollectrCsvFormat.key(game.name()), game.slug());
            gameKeys.put(CollectrCsvFormat.key(game.shortName()), game.slug());
        }
        return ImportMatcher.csv(
                sheet,
                defaultGame,
                new ImportMatcher.Catalog(
                        Map.of(),
                        Map.of(),
                        byName,
                        byCode,
                        catalog.printingRefsOfCards(cardIds),
                        schemas(),
                        gameKeys));
    }

    /** The active game {@code slug} names, or 400; {@code null} without one. */
    private @Nullable String defaultGame(@Nullable String slug) {
        if (slug == null || slug.isBlank()) {
            return null;
        }
        String wanted = slug.trim().toLowerCase(Locale.ROOT);
        if (games.find(wanted).filter(GameView::isActive).isEmpty()) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
        return wanted;
    }

    private Map<String, GameSchema> schemas() {
        Map<String, GameSchema> schemas = new LinkedHashMap<>();
        games.active().forEach(game -> schemas.put(game.slug(), game.schema()));
        return schemas;
    }

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    /** The caller's import, whatever its state; 404 for anything else. */
    private ImportRecord require(UUID ownerId, UUID importId) {
        return imports.find(importId)
                .filter(record -> record.ownerId().equals(ownerId))
                .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
    }

    /** {@code record} unless it is a preview past its time to live (410). */
    private ImportRecord usable(ImportRecord record) {
        if (record.expired(timeProvider.now())) {
            throw new ApiException(
                    ErrorCode.IMPORT_EXPIRED,
                    "This import preview has expired: upload the file again");
        }
        return record;
    }

    /**
     * The caller's preview, locked for an edit: 404 when it is not theirs, 410 when it expired, 409
     * once its commit started.
     */
    private ImportRecord editable(UUID ownerId, UUID importId) {
        ImportRecord record =
                imports.lock(importId)
                        .filter(found -> found.ownerId().equals(ownerId))
                        .orElseThrow(() -> ApiException.notFound(NOT_FOUND));
        if (record.status() != ImportStatus.PENDING) {
            throw alreadyCommitted(record);
        }
        return usable(record);
    }

    private static ApiException alreadyCommitted(ImportRecord record) {
        return new ApiException(
                        ErrorCode.IMPORT_ALREADY_COMMITTED,
                        "This import is already being added to the inventory: it can no longer be"
                                + " changed")
                .withProperty("currentStatus", record.status().name());
    }

    private static ApiException catalogChanged() {
        return ApiException.conflict(
                "A printing of this import is no longer in the catalog: open the import again");
    }

    private ImportView view(ImportRecord record) {
        return new ImportView(record, imports.summary(record.id()));
    }

    private List<ImportRowView> rowViews(ImportRecord record, List<ImportRow> rows) {
        Set<UUID> cardIds = new LinkedHashSet<>();
        Set<UUID> printingIds = new LinkedHashSet<>();
        for (ImportRow row : rows) {
            if (row.cardId() != null) {
                cardIds.add(row.cardId());
            }
            if (row.printingId() != null) {
                printingIds.add(row.printingId());
            }
        }
        Map<UUID, CardSummary> cards = catalog.cardSummariesIncludingHidden(cardIds);
        Map<UUID, PrintingSummary> printings = new HashMap<>();
        catalog.printingsIncludingHidden(printingIds)
                .forEach(printing -> printings.put(printing.id(), printing));
        OwnedCopies owned = inventory.ownedCopies(record.ownerId(), printingIds);
        List<ImportRowView> views = new ArrayList<>();
        for (ImportRow row : rows) {
            @Nullable PrintingSummary printing =
                    row.printingId() == null ? null : printings.get(row.printingId());
            @Nullable String language =
                    row.language() != null
                            ? row.language()
                            : printing == null ? null : printing.language();
            @Nullable String edition =
                    row.edition() != null
                            ? row.edition()
                            : printing == null ? null : printing.edition();
            @Nullable MergeKey key =
                    printing == null || row.condition() == null
                            ? null
                            : new MergeKey(
                                    printing.id(),
                                    row.condition(),
                                    Objects.requireNonNull(edition),
                                    Objects.requireNonNull(language));
            int ownedQuantity = key == null ? 0 : owned.privateCopies().getOrDefault(key, 0);
            int shownQuantity = key == null ? 0 : owned.shownCopies().getOrDefault(key, 0);
            views.add(
                    new ImportRowView(
                            row,
                            record,
                            row.cardId() == null ? null : cards.get(row.cardId()),
                            printing,
                            language,
                            edition,
                            ownedQuantity,
                            shownQuantity));
        }
        return views;
    }

    private boolean isPrintingOf(UUID printingId, UUID cardId) {
        @Nullable CatalogPrintingRef printing =
                catalog.printingRefs(List.of(printingId)).get(printingId);
        return printing != null && printing.cardId().equals(cardId);
    }

    /** The condition vocabulary of the game of each card (empty: the game has none). */
    private Map<UUID, List<String>> conditionsOf(Collection<UUID> cardIds) {
        Map<String, GameSchema> schemas = schemas();
        Map<UUID, List<String>> conditions = new LinkedHashMap<>();
        catalog.cardSummariesIncludingHidden(cardIds)
                .forEach(
                        (cardId, card) -> {
                            @Nullable GameSchema schema = schemas.get(card.game());
                            conditions.put(
                                    cardId, schema == null ? List.of() : schema.conditions());
                        });
        return conditions;
    }

    private static boolean isCondition(String condition, @Nullable List<String> conditions) {
        if (!condition.matches(GameSchema.CODE)) {
            return false;
        }
        return conditions == null || conditions.isEmpty() || conditions.contains(condition);
    }

    private static ProblemFieldError conditionError(@Nullable List<String> conditions) {
        return new ProblemFieldError(
                "condition",
                conditions == null || conditions.isEmpty()
                        ? "must be an upper-case condition code"
                        : "must be one of " + String.join(", ", conditions));
    }

    /** The problem a refused file answers with; the message never repeats the file. */
    private static ApiException refusal(ImportFileException e) {
        ApiException problem =
                switch (e.reason()) {
                    case TOO_LARGE -> new ApiException(ErrorCode.PAYLOAD_TOO_LARGE, e.getMessage());
                    case NOT_TEXT ->
                            new ApiException(ErrorCode.UNSUPPORTED_MEDIA_TYPE, e.getMessage());
                    default ->
                            ApiException.validation(
                                    e.getMessage(),
                                    List.of(new ProblemFieldError("file", e.getMessage())));
                };
        problem.withProperty("reason", e.reason().name());
        if (e.limit() != null) {
            problem.withProperty("fileLimit", e.limit());
        }
        if (!e.missingColumns().isEmpty()) {
            problem.withProperty("missingColumns", e.missingColumns());
        }
        return problem;
    }
}
