package com.orenjitrade.api.cards.domain.provider;

import org.jspecify.annotations.Nullable;

/**
 * An image as a {@link CardProvider} describes it: either a printing-specific image (placeholders
 * of the mock catalog) or a provider artwork identified by {@code providerImageId}.
 *
 * @param kind FRONT, BACK or ART_CROP
 * @param url absolute source URL of a provider artwork (server-side only, never sent to clients
 *     when the provider is {@link ImageHostingPolicy#REHOST_REQUIRED}), or the API-relative path of
 *     a placeholder
 * @param width pixel width, when known
 * @param height pixel height, when known
 * @param source where the image comes from ({@code placeholder}, provider id, ...)
 * @param providerImageId stable id of the artwork at the provider ({@code null} for placeholders);
 *     unique per provider, one {@code card_image} row per id
 */
public record ProviderImage(
        String kind,
        String url,
        @Nullable Integer width,
        @Nullable Integer height,
        String source,
        @Nullable String providerImageId) {

    /** A printing-specific image without provider identity (placeholders). */
    public ProviderImage(
            String kind,
            String url,
            @Nullable Integer width,
            @Nullable Integer height,
            String source) {
        this(kind, url, width, height, source, null);
    }

    /** A provider artwork (source URL server-side only). */
    public static ProviderImage artwork(
            String providerId, String providerImageId, String sourceUrl) {
        return new ProviderImage("FRONT", sourceUrl, null, null, providerId, providerImageId);
    }
}
