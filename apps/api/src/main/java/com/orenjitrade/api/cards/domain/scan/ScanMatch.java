package com.orenjitrade.api.cards.domain.scan;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The answer of {@code POST /api/v1/cards/scan-match}. English Yu-Gi-Oh! printings only; pictures
 * are {@code /api/v1/public/card-images/...} addresses (or the placeholder), never a provider's.
 * Holds no place (ADR 0017).
 *
 * @param status FOUND, PICK_RARITY, PICK_PRINTING or NOT_FOUND
 * @param reason why nothing was found (NOT_FOUND only)
 * @param card the card (every status but NOT_FOUND)
 * @param printing the printing (FOUND only)
 * @param rarities the printings of the code, one per rarity (PICK_RARITY only)
 * @param printings every English printing of the card, newest set first (the Pick printing list)
 * @param otherMatches at most 6 other cards it could be: look-alike codes first, then close names
 * @param read what was read, as the server cleaned it
 */
@Schema(name = "CardScanMatch", description = "The card a scan read points to")
public record ScanMatch(
        ScanStatus status,
        @Nullable ScanNotFoundReason reason,
        @Nullable Card card,
        @Nullable Printing printing,
        List<Printing> rarities,
        List<Printing> printings,
        List<OtherMatch> otherMatches,
        Read read) {

    /**
     * A card.
     *
     * @param id card id
     * @param name card name
     * @param imageUrl its picture (a card-images or placeholder address of this API)
     */
    @Schema(name = "CardScanCard", description = "The matched card")
    public record Card(
            UUID id,
            @Schema(example = "Ash Blossom & Joyous Spring") String name,
            @Nullable String imageUrl) {}

    /**
     * A printing of the card.
     *
     * @param id printing id (what an inventory line names)
     * @param printingCode code printed on the card
     * @param setCode set code
     * @param setName set name
     * @param rarity rarity label
     */
    @Schema(name = "CardScanPrinting", description = "A printing of the matched card")
    public record Printing(
            UUID id,
            @Schema(example = "MACR-EN036") @Nullable String printingCode,
            @Schema(example = "MACR") String setCode,
            @Schema(example = "Maximum Crisis") String setName,
            @Schema(example = "Secret Rare") @Nullable String rarity) {}

    /**
     * Another card the read could be.
     *
     * @param cardId card id
     * @param name card name
     * @param imageUrl its picture
     * @param kind CODE (a code close to the read one is its) or NAME (its name is close)
     * @param printingCode the code (CODE only)
     * @param setName the set of that code (CODE only)
     * @param printingId the printing when the code comes in one rarity (CODE only)
     * @param rarity its rarity when the code comes in one rarity (CODE only)
     */
    @Schema(name = "CardScanOtherMatch", description = "Another card the scan could be")
    public record OtherMatch(
            UUID cardId,
            String name,
            @Nullable String imageUrl,
            ScanOtherMatchKind kind,
            @Nullable String printingCode,
            @Nullable String setName,
            @Nullable UUID printingId,
            @Nullable String rarity) {}

    /**
     * What was read.
     *
     * @param codes the code candidates, cleaned (upper case, no spaces, one kind of dash)
     * @param names the name candidates, trimmed
     */
    @Schema(name = "CardScanRead", description = "What the phone read, as the server cleaned it")
    public record Read(List<String> codes, List<String> names) {}
}
