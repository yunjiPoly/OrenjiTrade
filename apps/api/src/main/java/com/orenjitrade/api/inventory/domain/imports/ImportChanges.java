package com.orenjitrade.api.inventory.domain.imports;

import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** What a collector changes in a preview (validated by {@link InventoryImportService}). */
public final class ImportChanges {

    private ImportChanges() {}

    /**
     * A partial change of one row: a field is changed only when {@link #has} says it was sent.
     * {@code printingId} may be {@code null} (back to "choose a printing") and so may {@code
     * quantity} (back to the copies of the file).
     *
     * @param present names of the fields sent
     * @param printingId a printing of the row's card
     * @param condition a condition of the card's game
     * @param quantity copies, 1-9999
     * @param included whether the row stays in the import
     */
    public record RowPatch(
            Set<String> present,
            @Nullable UUID printingId,
            @Nullable String condition,
            @Nullable Integer quantity,
            @Nullable Boolean included) {

        public RowPatch {
            present = Set.copyOf(present);
        }

        public boolean has(String field) {
            return present.contains(field);
        }
    }

    /** What can be done to every row of a preview at once. */
    public enum BulkAction {
        /**
         * Every matched row without a printing gets the most recent printing of its card (by the
         * release date of the set), among the printings its file narrowed it to when it did. Where
         * that most recent set holds the card in several editions or finishes, the plain copy is
         * taken and the row is marked ({@code MOST_RECENT_ASSUMED}); where the date decides nothing
         * otherwise (two rarities, two languages, no date), the row stays to choose.
         */
        USE_MOST_RECENT_PRINTING,
        /**
         * Every matched row whose condition nobody chose (source DEFAULT) gets {@code condition}.
         */
        SET_CONDITION
    }

    /**
     * The outcome of a change of one row.
     *
     * @param row the row as it is now
     * @param summary the counts of the preview
     */
    public record RowChange(ImportRowView row, ImportView summary) {}

    /**
     * The outcome of a bulk action.
     *
     * @param updated rows changed
     * @param assumed {@code USE_MOST_RECENT_PRINTING}: of {@code updated}, the rows that got the
     *     plain copy (Unlimited, normal finish) because the most recent set holds their card in
     *     several editions or finishes
     * @param undecided {@code USE_MOST_RECENT_PRINTING}: rows left to choose because several
     *     printings of their card share the most recent release date and no plain copy decides
     * @param summary the preview with its counts
     */
    public record BulkChange(int updated, int assumed, int undecided, ImportView summary) {}
}
