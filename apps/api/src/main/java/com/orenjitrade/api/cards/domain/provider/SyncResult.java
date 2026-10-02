package com.orenjitrade.api.cards.domain.provider;

import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * What {@link CardProvider#syncCards} returns: the sets and cards (with printings, images and
 * prices) to import. {@code CatalogImportService} persists it idempotently.
 *
 * @param providerId the provider
 * @param gameSlug the game
 * @param sets sets referenced by the cards
 * @param cards cards with their printings
 * @param providerVersion version of the provider's catalog when it has one (YGOPRODeck {@code
 *     database_version})
 * @param warnings client-safe notes about provider rows that were skipped while mapping (invalid
 *     codes, duplicates), reported by the import
 */
public record SyncResult(
        String providerId,
        String gameSlug,
        List<ProviderSet> sets,
        List<ProviderCard> cards,
        @Nullable String providerVersion,
        List<String> warnings) {

    public SyncResult {
        sets = List.copyOf(sets);
        cards = List.copyOf(cards);
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    /** A result without version or warnings (mock catalog). */
    public SyncResult(
            String providerId, String gameSlug, List<ProviderSet> sets, List<ProviderCard> cards) {
        this(providerId, gameSlug, sets, cards, null, List.of());
    }
}
