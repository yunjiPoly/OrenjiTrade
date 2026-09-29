package com.orenjitrade.api.cards.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A printing in card details, set details and (later) inventory items.
 *
 * @param id printing id
 * @param cardId card id
 * @param setId set id
 * @param setCode set code
 * @param setName set name
 * @param collectorNumber collector number within the set
 * @param printingCode code printed on the card
 * @param rarity rarity label
 * @param edition edition code
 * @param language ISO 639-1 code
 * @param finish finish code
 * @param images images (at least the placeholder FRONT)
 * @param marketPrice indicative market price
 */
@Schema(name = "PrintingSummary", description = "Printing of a card")
public record PrintingSummary(
        UUID id,
        UUID cardId,
        UUID setId,
        @Schema(example = "AZR") String setCode,
        @Schema(example = "Azure Dawn") String setName,
        @Schema(example = "EN001") String collectorNumber,
        @Schema(example = "AZR-EN001") @Nullable String printingCode,
        @Schema(example = "Ultra Rare") @Nullable String rarity,
        @Schema(example = "FIRST_EDITION") String edition,
        @Schema(example = "en") String language,
        @Schema(example = "NORMAL") String finish,
        List<PrintingImage> images,
        @Nullable MarketPrice marketPrice) {}
