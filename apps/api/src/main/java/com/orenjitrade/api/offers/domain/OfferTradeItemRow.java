package com.orenjitrade.api.offers.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * One of the buyer's cards in a proposal ({@code offer_trade_item} row).
 *
 * @param offerId the proposal
 * @param inventoryItemId the buyer's inventory item ({@code null} after an account purge)
 * @param quantity copies offered
 * @param position order in the proposal
 */
public record OfferTradeItemRow(
        UUID offerId, @Nullable UUID inventoryItemId, int quantity, int position) {}
