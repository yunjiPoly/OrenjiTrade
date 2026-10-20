package com.orenjitrade.api.cards.domain.scan;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
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
        @Schema(requiredMode = RequiredMode.REQUIRED) ScanStatus status,
        @Nullable ScanNotFoundReason reason,
        @Nullable Card card,
        @Nullable Printing printing,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<Printing> rarities,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<Printing> printings,
        @Schema(requiredMode = RequiredMode.REQUIRED) List<OtherMatch> otherMatches,
        @Schema(requiredMode = RequiredMode.REQUIRED) Read read) {

    /**
     * A card.
     *
     * @param id card id
     * @param name card name
     * @param imageUrl its picture (a card-images or placeholder address of this API)
     */
    @Schema(name = "CardScanCard", description = "The matched card")
    public record Card(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Ash Blossom & Joyous Spring")
                    String name,
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
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(example = "MACR-EN036") @Nullable String printingCode,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "MACR") String setCode,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maximum Crisis")
                    String setName,
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
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID cardId,
            @Schema(requiredMode = RequiredMode.REQUIRED) String name,
            @Nullable String imageUrl,
            @Schema(requiredMode = RequiredMode.REQUIRED) ScanOtherMatchKind kind,
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
    public record Read(
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> codes,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<String> names) {}
}
