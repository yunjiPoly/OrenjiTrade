package com.orenjitrade.api.cards.domain;

import java.util.UUID;

/**
 * A card of an ACTIVE game as the grouped catalog lookups return it (inventory import: many file
 * rows are matched with one query, never one query per row).
 *
 * @param id card id
 * @param game game slug
 * @param name card name
 */
public record CatalogCardRef(UUID id, String game, String name) {}
