package com.orenjitrade.api.messaging.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * The card or deck core a chat is about, its pinned bar (stage R4 of the phone redesign; owner spec
 * 2026-10-14, sections 10 and 12): the latest one opened from a listing, or the card its owner
 * shared. Its owner is the seller; the other collector the buyer. When it stops being on offer
 * (made private, deleted or sold) the buyer still sees its name and picture, with {@code listed}
 * false and no price.
 *
 * @param kind CARD or DECK_CORE
 * @param id the inventory item or the binder
 * @param ownerId its owner (the seller)
 * @param name card or deck core name
 * @param printingCode the card's code (cards)
 * @param rarity the card's rarity (cards)
 * @param cardId the card (cards: opens "Who has this card")
 * @param printingId the printing (cards)
 * @param imageUrl the card's picture, or the deck core's first photo
 * @param askingPriceText the price as typed; {@code null} without one, and for the buyer while it
 *     is not listed
 * @param sold it was marked sold in this chat (a sale not undone since it was pinned)
 * @param listed still on offer: in the inventory (a deck core: not sold) and public, or shared by
 *     its owner in this chat
 * @param copies the copies its owner holds (the owner's view of a card in the inventory only)
 */
@Schema(name = "ConversationSubject", description = "The card or deck core a chat is about")
public record ConversationSubject(
        @Schema(requiredMode = RequiredMode.REQUIRED) SubjectKind kind,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = RequiredMode.REQUIRED) UUID ownerId,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Ash Blossom & Joyous Spring")
                String name,
        @Schema(nullable = true, example = "RA01-EN008") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String printingCode,
        @Schema(nullable = true, example = "Secret Rare") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String rarity,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID cardId,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable UUID printingId,
        @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS) @Nullable String imageUrl,
        @Schema(nullable = true, example = "$32") @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable String askingPriceText,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean sold,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean listed,
        @Schema(nullable = true, description = "The owner's copies (the owner's view of a card)")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable Integer copies) {}
