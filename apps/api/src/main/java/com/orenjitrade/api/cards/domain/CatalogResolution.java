package com.orenjitrade.api.cards.domain;

import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * What a free-text query unambiguously designates in the catalog (Phase 4 unified search): one
 * printing (an exact printing code shared by no other printing) or one card (a printing code whose
 * printings all belong to one card, or an exact card name matching a single card).
 *
 * @param printingId the printing, {@code null} when only the card is known
 * @param cardId the card
 */
public record CatalogResolution(@Nullable UUID printingId, UUID cardId) {}
