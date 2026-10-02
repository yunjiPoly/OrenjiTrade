package com.orenjitrade.api.inventory.domain;

import com.orenjitrade.api.inventory.infra.InventoryItemRepository.AdminRow;
import org.jspecify.annotations.Nullable;

/**
 * A listing of the admin console with its card's picture.
 *
 * @param row stored listing (never private notes)
 * @param imageUrl the printing's picture from the cards module (ADR 0015: OrenjiTrade's own card
 *     image or placeholder URL, never a re-host-only provider URL), {@code null} when unknown
 */
public record AdminListingView(AdminRow row, @Nullable String imageUrl) {}
