package com.orenjitrade.api.inventory.domain.imports;

/**
 * What a commit wrote so far ({@code inventory_import.result}).
 *
 * @param itemsCreated new inventory items
 * @param itemsMerged existing items whose quantity was raised
 * @param copiesAdded copies added to the inventory
 * @param rowsImported rows of the preview that went in
 */
public record ImportResult(int itemsCreated, int itemsMerged, int copiesAdded, int rowsImported) {

    public static final ImportResult NONE = new ImportResult(0, 0, 0, 0);

    /** This result with one more chunk. */
    public ImportResult plus(int created, int merged, int copies) {
        return new ImportResult(
                itemsCreated + created, itemsMerged + merged, copiesAdded + copies, rowsImported);
    }
}
