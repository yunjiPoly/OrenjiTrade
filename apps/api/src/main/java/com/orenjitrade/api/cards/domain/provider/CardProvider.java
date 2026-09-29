package com.orenjitrade.api.cards.domain.provider;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * External catalog source (ADR 0005): YGOPRODeck, PokémonTCG.io, Scryfall, Riftbound sources later;
 * {@code MockCardProvider} (fixtures, profiles local/dev/test) today. Providers only read; {@code
 * CatalogImportService} maps their DTOs to the catalog tables idempotently (keyed by {@code
 * external_ref}).
 */
public interface CardProvider {

    /** Stable id stored in {@code external_ref.provider} and {@code catalog_sync_run.provider}. */
    String providerId();

    /** Game slugs this provider can serve. */
    Set<String> supportedGameSlugs();

    /** Cards whose name matches {@code query} (provider-side search), at most {@code limit}. */
    List<ProviderCard> searchCards(String gameSlug, String query, int limit);

    Optional<ProviderCard> getCard(String gameSlug, String externalId);

    List<ProviderSet> getSets(String gameSlug);

    List<ProviderPrinting> getCardPrintings(String gameSlug, String externalCardId);

    List<ProviderImage> getImages(String gameSlug, String externalPrintingId);

    Optional<ProviderMarketPrice> getMarketPrices(String gameSlug, String externalPrintingId);

    /** Everything to import for a full or incremental sync of {@code gameSlug}. */
    SyncResult syncCards(String gameSlug, SyncOptions options);
}
