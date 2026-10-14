package com.orenjitrade.api.inventory.domain.imports;

import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A stored row of a preview ({@code inventory_import_row}); see {@link ImportDraftRow} for the
 * fields the matcher fills.
 *
 * @param id the row
 * @param quantity the copies the collector typed; {@code null} = the copies of the file
 * @param included whether the collector keeps the row in the import
 * @param commitChunk the chunk that writes the row, once the commit started
 */
public record ImportRow(
        UUID id,
        UUID importId,
        int position,
        @Nullable String passcode,
        @Nullable String sourceName,
        @Nullable String sourceSet,
        @Nullable String sourceNumber,
        @Nullable String sourceRarity,
        @Nullable Integer qtyMain,
        @Nullable Integer qtyExtra,
        @Nullable Integer qtySide,
        int fileQuantity,
        @Nullable Integer quantity,
        @Nullable UUID cardId,
        @Nullable UnmatchedReason unmatchedReason,
        int printingCount,
        List<UUID> suggestedPrintingIds,
        @Nullable UUID printingId,
        @Nullable PrintingChoice printingChoice,
        @Nullable String condition,
        ConditionSource conditionSource,
        @Nullable String language,
        @Nullable String edition,
        boolean included,
        @Nullable Integer commitChunk) {

    public ImportRow {
        suggestedPrintingIds = List.copyOf(suggestedPrintingIds);
    }

    /** What the catalog made of the row. */
    public RowStatus status() {
        if (cardId == null) {
            return RowStatus.UNMATCHED;
        }
        return printingId == null ? RowStatus.CHOOSE_PRINTING : RowStatus.READY;
    }

    /** Why the row fits nothing ({@code null} when it fits). */
    public @Nullable UnmatchedReason reason() {
        if (cardId != null) {
            return null;
        }
        return unmatchedReason != null ? unmatchedReason : UnmatchedReason.CARD_REMOVED;
    }

    /**
     * Whether the sections of the deck that count hold the row (always for a CSV row): a card that
     * is only in the side deck is out while the side deck does not count.
     */
    public boolean inScope(ImportRecord owner) {
        if (owner.source() != ImportSource.YDK) {
            return true;
        }
        return (owner.includeMain() && positive(qtyMain))
                || (owner.includeExtra() && positive(qtyExtra))
                || (owner.includeSide() && positive(qtySide));
    }

    /** The copies the row adds: the collector's number, else the file's in the sections kept. */
    public int effectiveQuantity(ImportRecord owner) {
        if (quantity != null) {
            return quantity;
        }
        if (owner.source() != ImportSource.YDK) {
            return fileQuantity;
        }
        int copies = 0;
        copies += owner.includeMain() && qtyMain != null ? qtyMain : 0;
        copies += owner.includeExtra() && qtyExtra != null ? qtyExtra : 0;
        copies += owner.includeSide() && qtySide != null ? qtySide : 0;
        return Math.min(copies, ImportMatcher.QUANTITY_MAX);
    }

    /** Whether a commit writes the row. */
    public boolean willImport(ImportRecord owner) {
        return status() == RowStatus.READY
                && included
                && inScope(owner)
                && effectiveQuantity(owner) >= 1;
    }

    private static boolean positive(@Nullable Integer value) {
        return value != null && value > 0;
    }
}
