package com.orenjitrade.api.cards.domain.provider;

import java.io.IOException;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * External catalog source (ADR 0005): {@code YgoProDeckCardProvider} (Yu-Gi-Oh!), PokémonTCG.io,
 * Scryfall and Riftbound sources later; {@code MockCardProvider} (fixtures, profiles
 * local/dev/test). Providers only read; {@code CatalogImportService} maps their DTOs to the catalog
 * tables idempotently (keyed by {@code external_ref}) and {@code CardImageCache} stores their
 * artworks according to {@link #imageHostingPolicy()} (ADR 0015).
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

    /**
     * How clients may show this provider's artworks. The safe default never hands provider URLs to
     * clients; a provider whose terms explicitly allow hotlinking overrides it.
     */
    default ImageHostingPolicy imageHostingPolicy() {
        return ImageHostingPolicy.REHOST_REQUIRED;
    }

    /** Whether {@link #openImage} can download this provider's artworks for the local cache. */
    default boolean supportsImageDownloads() {
        return false;
    }

    /**
     * Opens an artwork for the local image cache. Implementations only accept source URLs they
     * produced themselves (host allow-list), apply the provider's rate limit and retry transient
     * failures (timeouts, 5xx, 429 with {@code Retry-After}); the caller streams and closes the
     * body.
     *
     * @throws ImageMissingAtSourceException the provider answered 404 / 410
     * @throws ProviderUnavailableException the provider stayed unreachable after the retries
     * @throws ProviderRequestException any other refusal (never retried)
     * @throws IOException transport failure while opening the response
     */
    default ImageDownload openImage(String sourceUrl) throws IOException {
        throw new ProviderRequestException(
                "The provider " + providerId() + " does not offer image downloads", 0);
    }
}
