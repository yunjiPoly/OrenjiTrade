package com.orenjitrade.api.cards.domain.images;

import com.orenjitrade.api.cards.domain.CatalogImages;
import com.orenjitrade.api.cards.domain.PrintingImage;
import com.orenjitrade.api.cards.domain.provider.CardProvider;
import com.orenjitrade.api.cards.domain.provider.ImageHostingPolicy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * The single place that turns a {@code card_image} row into the URL clients receive (ADR 0015).
 * Every DTO carrying card imagery gets its URL from here (through {@code CatalogQueryRepository}):
 *
 * <ul>
 *   <li>provider artwork of a {@link ImageHostingPolicy#REHOST_REQUIRED} provider (YGOPRODeck) →
 *       OrenjiTrade's own {@code /api/v1/public/card-images/{id}} (cached file, on-demand fill or
 *       placeholder); the provider URL never leaves the server;
 *   <li>provider artwork of a {@link ImageHostingPolicy#HOTLINK_ALLOWED} provider → the provider
 *       URL;
 *   <li>placeholder / legacy rows → their stored URL (API-relative paths resolved against the
 *       request origin);
 *   <li>no image → the card's server-generated placeholder SVG.
 * </ul>
 */
@Component
public class CardImageUrlResolver {

    /** Public path of cached provider artworks. */
    public static final String CARD_IMAGE_PATH = "/api/v1/public/card-images/";

    private final Map<String, ImageHostingPolicy> policies = new HashMap<>();

    public CardImageUrlResolver(List<CardProvider> providers) {
        providers.forEach(
                provider -> policies.put(provider.providerId(), provider.imageHostingPolicy()));
    }

    /** Hosting policy of a provider (unknown providers: re-host only). */
    public ImageHostingPolicy policy(@Nullable String providerId) {
        return providerId == null
                ? ImageHostingPolicy.REHOST_REQUIRED
                : policies.getOrDefault(providerId, ImageHostingPolicy.REHOST_REQUIRED);
    }

    /** Client URL of an image, or of the card's placeholder when {@code ref} is null. */
    public String url(@Nullable ImageRef ref, String gameSlug, String cardSlug) {
        if (ref == null) {
            return CatalogImages.resolve(CatalogImages.placeholderPath(gameSlug, cardSlug));
        }
        if (ref.providerImageId() != null) {
            if (policy(ref.provider()) == ImageHostingPolicy.HOTLINK_ALLOWED
                    && ref.sourceUrl() != null) {
                return ref.sourceUrl();
            }
            return CatalogImages.resolve(CARD_IMAGE_PATH + ref.id());
        }
        return CatalogImages.resolveOrPlaceholder(ref.url(), gameSlug, cardSlug);
    }

    /** The image as a {@link PrintingImage} (dimensions only when known). */
    public PrintingImage printingImage(@Nullable ImageRef ref, String gameSlug, String cardSlug) {
        if (ref == null) {
            return new PrintingImage(
                    CatalogImages.KIND_FRONT,
                    url(null, gameSlug, cardSlug),
                    CatalogImages.PLACEHOLDER_WIDTH,
                    CatalogImages.PLACEHOLDER_HEIGHT);
        }
        boolean provider = ref.providerImageId() != null;
        boolean knownSize = !provider || "CACHED".equals(ref.cacheStatus());
        return new PrintingImage(
                ref.kind(),
                url(ref, gameSlug, cardSlug),
                knownSize ? ref.width() : null,
                knownSize ? ref.height() : null);
    }

    /**
     * The columns of a {@code card_image} row the resolver needs. {@code sourceUrl} is server-side
     * data: it only ever leaves the server for {@link ImageHostingPolicy#HOTLINK_ALLOWED}
     * providers.
     */
    public record ImageRef(
            UUID id,
            String kind,
            @Nullable String url,
            @Nullable String provider,
            @Nullable String providerImageId,
            @Nullable String sourceUrl,
            @Nullable String cacheStatus,
            @Nullable Integer width,
            @Nullable Integer height) {}
}
