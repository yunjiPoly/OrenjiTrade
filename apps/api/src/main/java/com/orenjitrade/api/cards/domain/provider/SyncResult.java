package com.orenjitrade.api.cards.domain.provider;

import java.util.List;

/**
 * What {@link CardProvider#syncCards} returns: the sets and cards (with printings, images and
 * prices) to import. {@code CatalogImportService} persists it idempotently.
 *
 * @param providerId the provider
 * @param gameSlug the game
 * @param sets sets referenced by the cards
 * @param cards cards with their printings
 */
public record SyncResult(
        String providerId, String gameSlug, List<ProviderSet> sets, List<ProviderCard> cards) {

    public SyncResult {
        sets = List.copyOf(sets);
        cards = List.copyOf(cards);
    }
}
