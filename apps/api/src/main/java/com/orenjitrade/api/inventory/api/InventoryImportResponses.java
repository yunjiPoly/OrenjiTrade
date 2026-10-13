package com.orenjitrade.api.inventory.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.inventory.domain.imports.ConditionSource;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.BulkChange;
import com.orenjitrade.api.inventory.domain.imports.ImportChanges.RowChange;
import com.orenjitrade.api.inventory.domain.imports.ImportRecord;
import com.orenjitrade.api.inventory.domain.imports.ImportRow;
import com.orenjitrade.api.inventory.domain.imports.ImportRowView;
import com.orenjitrade.api.inventory.domain.imports.ImportSource;
import com.orenjitrade.api.inventory.domain.imports.ImportStatus;
import com.orenjitrade.api.inventory.domain.imports.ImportSummary;
import com.orenjitrade.api.inventory.domain.imports.ImportView;
import com.orenjitrade.api.inventory.domain.imports.InventoryImportSettings;
import com.orenjitrade.api.inventory.domain.imports.PrintingChoice;
import com.orenjitrade.api.inventory.domain.imports.RowStatus;
import com.orenjitrade.api.inventory.domain.imports.UnmatchedReason;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Response DTOs of the inventory import endpoints. */
public final class InventoryImportResponses {

    private InventoryImportResponses() {}

    /** An import: the preview, then its commit. */
    @Schema(
            name = "InventoryImportResponse",
            description = "An inventory import of the caller: a preview, then its commit")
    public record ImportResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED) ImportSource source,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "PENDING: a preview that can be edited, committed or"
                                            + " discarded. COMMITTING: the commit wrote some"
                                            + " chunks; commit again to finish. COMMITTED: done")
                    ImportStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED) Instant createdAt,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Until when the preview can be used; after a commit, until"
                                            + " when its result stays readable")
                    Instant expiresAt,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant committedAt,
            @Schema(
                            nullable = true,
                            description =
                                    "YDK only: which sections of the deck count (null for a CSV)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable SectionsResponse sections,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Lines of the file that were no card (YDK: no passcode; CSV:"
                                            + " rows without a card name)",
                            example = "0")
                    int ignoredLines,
            @Schema(requiredMode = RequiredMode.REQUIRED) SummaryResponse summary,
            @Schema(
                            nullable = true,
                            description = "Null until the commit starts",
                            requiredMode = RequiredMode.REQUIRED)
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable ResultResponse result) {

        static ImportResponse from(ImportView view) {
            ImportRecord record = view.record();
            @Nullable Integer totalChunks = record.totalChunks();
            return new ImportResponse(
                    record.id(),
                    record.source(),
                    record.status(),
                    record.createdAt(),
                    record.expiresAt(),
                    record.committedAt(),
                    record.source() == ImportSource.YDK
                            ? new SectionsResponse(
                                    record.includeMain(),
                                    record.includeExtra(),
                                    record.includeSide())
                            : null,
                    record.ignoredLines(),
                    SummaryResponse.from(view.summary()),
                    totalChunks == null
                            ? null
                            : new ResultResponse(
                                    record.result().itemsCreated(),
                                    record.result().itemsMerged(),
                                    record.result().copiesAdded(),
                                    record.result().rowsImported(),
                                    record.chunksDone(),
                                    totalChunks));
        }
    }

    /** Which sections of a deck count. */
    @Schema(name = "InventoryImportSections", description = "The sections of a deck that count")
    public record SectionsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean includeMain,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean includeExtra,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean includeSide) {}

    /** The counts of a preview. */
    @Schema(name = "InventoryImportSummary", description = "The counts of an import preview")
    public record SummaryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "40") int rows,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Rows a commit imports: a card, a printing, not left out",
                            example = "31")
                    int ready,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Rows that still need a printing (and are not left out)",
                            example = "7")
                    int toChoose,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Rows that fit nothing in the catalog",
                            example = "2")
                    int unmatched,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Matched rows the collector took out, or whose deck sections"
                                            + " do not count",
                            example = "0")
                    int leftOut,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Copies the ready rows add",
                            example = "52")
                    long copies,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Inventory items the ready rows write, once rows that are"
                                            + " equal are merged",
                            example = "30")
                    int items) {

        static SummaryResponse from(ImportSummary summary) {
            return new SummaryResponse(
                    summary.rows(),
                    summary.ready(),
                    summary.toChoose(),
                    summary.unmatched(),
                    summary.leftOut(),
                    summary.copies(),
                    summary.items());
        }
    }

    /** What a commit wrote. */
    @Schema(name = "InventoryImportResult", description = "What the commit of an import wrote")
    public record ResultResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "28") int itemsCreated,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Existing items whose quantity was raised",
                            example = "2")
                    int itemsMerged,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "52") int copiesAdded,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "31") int rowsImported,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "1") int chunksDone,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Chunks of at most 500 items; done when chunksDone equals"
                                            + " it",
                            example = "1")
                    int totalChunks) {}

    /** A row of a preview. */
    @Schema(name = "InventoryImportRow", description = "A row of an import preview")
    public record RowResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Order in the file, from 0",
                            example = "0")
                    int position,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "READY: a card and a printing. CHOOSE_PRINTING: a card, the"
                                            + " printing is to choose. UNMATCHED: nothing in the"
                                            + " catalog fits; never imported, never editable")
                    RowStatus status,
            @Schema(nullable = true, description = "Why the row is UNMATCHED")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UnmatchedReason unmatchedReason,
            @Schema(requiredMode = RequiredMode.REQUIRED) SourceResponse source,
            @Schema(nullable = true, description = "YDK only: copies per section of the deck")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable DeckCopiesResponse deck,
            @Schema(nullable = true, description = "Null when UNMATCHED")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable CardResponse card,
            @Schema(nullable = true, description = "The printing chosen; null while to choose")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PrintingSummary printing,
            @Schema(
                            nullable = true,
                            description =
                                    "AUTO: the row fits exactly one printing. MANUAL: chosen for"
                                            + " this row. MOST_RECENT: by the bulk action")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable PrintingChoice printingChoice,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Printings of the card in the catalog (GET"
                                            + " /cards/{id}/printings lists them)",
                            example = "2")
                    int printingCount,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "CSV: the printings that fit what the row says, when that is"
                                            + " fewer than all of them (at most 50); empty"
                                            + " otherwise. Any printing of the card may be chosen")
                    List<UUID> suggestedPrintingIds,
            @Schema(nullable = true, example = "DAMAGED", description = "Null when UNMATCHED")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String condition,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "DEFAULT: the file names no condition, so the row has the"
                                            + " lowest condition of the game until the collector"
                                            + " says otherwise. FILE: from the file. EDITED: set"
                                            + " for this row")
                    ConditionSource conditionSource,
            @Schema(
                            nullable = true,
                            example = "en",
                            description =
                                    "Language the item gets: the file's, else the printing's; null"
                                            + " while neither is known")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String language,
            @Schema(
                            nullable = true,
                            example = "UNLIMITED",
                            description = "Edition the item gets: the file's, else the printing's")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String edition,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Copies the row adds: the collector's number, else the copies"
                                            + " of the file (YDK: of the sections that count)",
                            example = "3")
                    int quantity,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Copies the file says (YDK: every section together); 0 when"
                                            + " the file wrote no number",
                            example = "3")
                    int fileQuantity,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether the collector typed the copies of this row")
                    boolean quantityEdited,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Whether the collector keeps the row in the import")
                    boolean included,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "YDK: whether a section that counts holds the card (always"
                                            + " true for a CSV)")
                    boolean inScope,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Whether a commit imports the row: READY, included, in scope")
                    boolean willImport,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Copies the caller already holds in an equal item (same"
                                            + " printing, condition, edition and language): the"
                                            + " commit raises that item instead of adding one",
                            example = "0")
                    int ownedQuantity) {

        static RowResponse from(ImportRowView view) {
            ImportRow row = view.row();
            ImportRecord owner = view.owner();
            @Nullable CardSummary card = view.card();
            boolean matched = row.status() != RowStatus.UNMATCHED;
            return new RowResponse(
                    row.id(),
                    row.position(),
                    row.status(),
                    row.reason(),
                    new SourceResponse(
                            row.passcode(),
                            row.sourceName(),
                            row.sourceSet(),
                            row.sourceNumber(),
                            row.sourceRarity()),
                    owner.source() == ImportSource.YDK
                            ? new DeckCopiesResponse(
                                    orZero(row.qtyMain()),
                                    orZero(row.qtyExtra()),
                                    orZero(row.qtySide()))
                            : null,
                    !matched || card == null
                            ? null
                            : new CardResponse(
                                    card.id(), card.name(), card.game(), card.primaryImageUrl()),
                    view.printing(),
                    row.printingChoice(),
                    row.printingCount(),
                    row.suggestedPrintingIds(),
                    row.condition(),
                    row.conditionSource(),
                    view.language(),
                    view.edition(),
                    row.effectiveQuantity(owner),
                    row.fileQuantity(),
                    row.quantity() != null,
                    row.included(),
                    row.inScope(owner),
                    row.willImport(owner),
                    view.ownedQuantity());
        }

        private static int orZero(@Nullable Integer value) {
            return value == null ? 0 : value;
        }
    }

    /** What the file says about a row. */
    @Schema(
            name = "InventoryImportRowSource",
            description =
                    "What the file says about a row: a passcode (YDK), or the card name, set,"
                            + " number and rarity as written (CSV). Never a price")
    public record SourceResponse(
            @Schema(nullable = true, example = "89631139") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String passcode,
            @Schema(nullable = true, example = "Azure-Eyes Sky Dragon")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String name,
            @Schema(nullable = true, example = "Azure Dawn")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String set,
            @Schema(nullable = true, example = "AZR-EN001") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String number,
            @Schema(nullable = true, example = "Ultra Rare")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String rarity) {}

    /** Copies of a card per section of a deck. */
    @Schema(name = "InventoryImportDeckCopies", description = "Copies per section of a deck")
    public record DeckCopiesResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "3") int main,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "0") int extra,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "0") int side) {}

    /** The card a row is. */
    @Schema(name = "InventoryImportCard", description = "The card a row of an import is")
    public record CardResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Azure-Eyes Sky Dragon")
                    String name,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "yugioh") String game,
            @Schema(nullable = true, description = "The card's picture (OrenjiTrade's own URL)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String imageUrl) {}

    /** {@code PATCH /inventory/imports/{id}/rows/{rowId}}. */
    @Schema(
            name = "InventoryImportRowChange",
            description = "A changed row and the preview with its new counts")
    public record RowChangeResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) RowResponse row,
            @Schema(requiredMode = RequiredMode.REQUIRED) ImportResponse preview) {

        static RowChangeResponse from(RowChange change) {
            return new RowChangeResponse(
                    RowResponse.from(change.row()), ImportResponse.from(change.summary()));
        }
    }

    /** {@code POST /inventory/imports/{id}/bulk}. */
    @Schema(
            name = "InventoryImportBulkResponse",
            description = "The rows a bulk action changed and the preview with its new counts")
    public record BulkResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "7") int updated,
            @Schema(requiredMode = RequiredMode.REQUIRED) ImportResponse preview) {

        static BulkResponse from(BulkChange change) {
            return new BulkResponse(change.updated(), ImportResponse.from(change.summary()));
        }
    }

    /** {@code GET /inventory/imports/limits}. */
    @Schema(
            name = "InventoryImportLimits",
            description = "What an import file may be (admin settings; the server enforces them)")
    public record LimitsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "102400") int ydkMaxBytes,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "500") int ydkMaxLines,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "2097152") int csvMaxBytes,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "5000") int csvMaxRows,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Minutes a preview is kept",
                            example = "60")
                    int previewTtlMinutes) {

        static LimitsResponse from(InventoryImportSettings.Values values) {
            return new LimitsResponse(
                    values.maxBytes(ImportSource.YDK),
                    values.ydkMaxLines(),
                    values.maxBytes(ImportSource.COLLECTR_CSV),
                    values.csvMaxRows(),
                    values.previewTtlMinutes());
        }
    }

    /** {@code GET|PUT /admin/inventory/import-settings}. */
    @Schema(
            name = "InventoryImportSettingsResponse",
            description = "The inventory.import.* settings (admin)")
    public record SettingsResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Largest YDK file in kB of 1 024 bytes",
                            example = "100")
                    int ydkMaxKb,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "500") int ydkMaxLines,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Largest CSV file in kB of 1 024 bytes",
                            example = "2048")
                    int csvMaxKb,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "5000") int csvMaxRows,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "60") int previewTtlMinutes,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID updatedBy,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant updatedAt) {

        static SettingsResponse from(InventoryImportSettings.Values values) {
            return new SettingsResponse(
                    values.ydkMaxKb(),
                    values.ydkMaxLines(),
                    values.csvMaxKb(),
                    values.csvMaxRows(),
                    values.previewTtlMinutes(),
                    values.updatedBy(),
                    values.updatedAt());
        }
    }

    static PageResponse<RowResponse> page(PageResponse<ImportRowView> page) {
        return PageResponse.of(
                page.items().stream().map(RowResponse::from).toList(),
                page.page(),
                page.size(),
                page.totalItems());
    }
}
