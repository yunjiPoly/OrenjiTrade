package com.orenjitrade.api.inventory.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * An inventory item as the subject of a chat (stage R4: the card a chat is about), whatever its
 * state. Never carries private notes.
 *
 * @param itemId the item
 * @param ownerId its owner (the seller)
 * @param cardId the card
 * @param printingId the printing
 * @param name card name
 * @param printingCode code printed on the card, when known
 * @param rarity rarity label, when known
 * @param game game slug
 * @param imageUrl the printing's picture (the card, never an owner photo)
 * @param askingPriceText the price as the owner typed it, {@code null} without one
 * @param quantity copies (of the deleted item: the copies it held)
 * @param live still in the inventory (not deleted)
 * @param listed buyers can find it on its own right now (public and live)
 */
public record ChatCard(
        UUID itemId,
        UUID ownerId,
        UUID cardId,
        UUID printingId,
        String name,
        @Nullable String printingCode,
        @Nullable String rarity,
        String game,
        @Nullable String imageUrl,
        @Nullable String askingPriceText,
        int quantity,
        boolean live,
        boolean listed) {}
