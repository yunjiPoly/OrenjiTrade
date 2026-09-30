package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.cards.domain.PrintingSummary;
import java.util.List;

/**
 * An item with its printing and photos, ready for owner or public responses (public mappers drop
 * the private notes).
 *
 * @param row stored values
 * @param printing printing summary (images, codes)
 * @param images owner photos
 */
public record InventoryItemView(ItemRow row, PrintingSummary printing, List<ItemImage> images) {}
