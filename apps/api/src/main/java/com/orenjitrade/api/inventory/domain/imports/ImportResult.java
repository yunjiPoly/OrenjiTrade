package com.orenjitrade.api.inventory.domain.imports;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.jspecify.annotations.Nullable;

/**
 * What a commit wrote so far ({@code inventory_import.result}).
 *
 * @param itemsCreated new inventory items
 * @param itemsMerged existing items whose quantity was raised
 * @param copiesAdded copies added to the inventory
 * @param rowsImported rows of the preview that went in
 * @param copiesNotAdded copies of those rows that were not added: one item holds at most 9 999
 *     copies, and the rows asked for more (equal rows together, or on top of the copies the
 *     collector had)
 */
public record ImportResult(
        int itemsCreated, int itemsMerged, int copiesAdded, int rowsImported, int copiesNotAdded) {

    public static final ImportResult NONE = new ImportResult(0, 0, 0, 0, 0);

    /**
     * A result stored before {@code copiesNotAdded} existed reads as 0 there (the stored JSON has
     * no such member).
     */
    @JsonCreator
    static ImportResult stored(
            @JsonProperty("itemsCreated") int itemsCreated,
            @JsonProperty("itemsMerged") int itemsMerged,
            @JsonProperty("copiesAdded") int copiesAdded,
            @JsonProperty("rowsImported") int rowsImported,
            @JsonProperty("copiesNotAdded") @Nullable Integer copiesNotAdded) {
        return new ImportResult(
                itemsCreated,
                itemsMerged,
                copiesAdded,
                rowsImported,
                copiesNotAdded == null ? 0 : copiesNotAdded);
    }

    /** This result with one more chunk. */
    public ImportResult plus(int created, int merged, int copies, int notAdded) {
        return new ImportResult(
                itemsCreated + created,
                itemsMerged + merged,
                copiesAdded + copies,
                rowsImported,
                copiesNotAdded + notAdded);
    }
}
