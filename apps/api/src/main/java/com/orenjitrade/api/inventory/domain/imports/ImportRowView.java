package com.orenjitrade.api.inventory.domain.imports;

import com.orenjitrade.api.cards.domain.CardSummary;
import com.orenjitrade.api.cards.domain.PrintingSummary;
import org.jspecify.annotations.Nullable;

/**
 * A row of a preview with what the catalog and the inventory say about it.
 *
 * @param row the row
 * @param owner its preview (the sections of a deck decide the copies of a row)
 * @param card the card it is; {@code null} when it fits nothing
 * @param printing the printing chosen; {@code null} while there is none
 * @param language the language the item gets: the file's, else the printing's
 * @param edition the edition the item gets: the file's, else the printing's
 * @param ownedQuantity copies the collector already holds in an equal item (same printing,
 *     condition, edition and language): the import adds to that item instead of a second one
 */
public record ImportRowView(
        ImportRow row,
        ImportRecord owner,
        @Nullable CardSummary card,
        @Nullable PrintingSummary printing,
        @Nullable String language,
        @Nullable String edition,
        int ownedQuantity) {}
