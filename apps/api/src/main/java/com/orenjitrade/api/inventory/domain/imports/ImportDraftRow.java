package com.orenjitrade.api.inventory.domain.imports;

import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A row of a preview as the matcher made it, before it is stored. It keeps of the file only what
 * the preview has to show (a passcode; a card name, set, number and rarity as written): never a
 * price, never anything else of the file.
 *
 * @param position order in the file, from 0
 * @param passcode YDK: the passcode
 * @param sourceName CSV: the card name as written
 * @param sourceSet CSV: the set as written
 * @param sourceNumber CSV: the number as written
 * @param sourceRarity CSV: the rarity as written
 * @param qtyMain YDK: copies in the main deck
 * @param qtyExtra YDK: copies in the extra deck
 * @param qtySide YDK: copies in the side deck
 * @param fileQuantity copies the file says (YDK: every section together); 0 when it is no number
 * @param cardId the card the row is, {@code null} when it fits nothing
 * @param game the card's game slug
 * @param unmatchedReason why it fits nothing
 * @param printingCount printings of the card in the catalog
 * @param suggestedPrintingIds CSV: the printings that fit what the row says, when that is fewer
 *     than all of them
 * @param printingId the printing chosen
 * @param printingChoice how it was chosen
 * @param condition condition code; {@code null} when the row fits nothing
 * @param conditionSource where the condition comes from
 * @param language CSV: the language the file names; {@code null} = the printing's
 * @param edition CSV: the edition the file names; {@code null} = the printing's
 */
public record ImportDraftRow(
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
        @Nullable UUID cardId,
        @Nullable String game,
        @Nullable UnmatchedReason unmatchedReason,
        int printingCount,
        List<UUID> suggestedPrintingIds,
        @Nullable UUID printingId,
        @Nullable PrintingChoice printingChoice,
        @Nullable String condition,
        ConditionSource conditionSource,
        @Nullable String language,
        @Nullable String edition) {

    public ImportDraftRow {
        suggestedPrintingIds = List.copyOf(suggestedPrintingIds);
    }
}
