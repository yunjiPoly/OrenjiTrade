package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The sender's own card behind a CARD_LINK shared from their inventory (stage R4): its price as
 * typed and its rarity when it was shared (the message keeps them; sharing a private card shows it
 * to the other collector only).
 *
 * @param itemId the inventory item (also the chat's subject from then on)
 * @param ownerId its owner, the sender
 * @param askingPriceText the price as typed when it was shared
 * @param rarity the card's rarity
 */
@Schema(name = "SharedItem", description = "The sender's own card shared from their inventory")
public record SharedItem(
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID itemId,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID ownerId,
        @Schema(nullable = true, example = "85% TCG") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String askingPriceText,
        @Schema(nullable = true, example = "Secret Rare") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String rarity) {}
