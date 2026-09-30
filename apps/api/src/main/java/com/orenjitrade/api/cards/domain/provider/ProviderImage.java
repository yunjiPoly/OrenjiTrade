package com.orenjitrade.api.cards.domain.provider;

import org.jspecify.annotations.Nullable;

/**
 * An image of a printing.
 *
 * @param kind FRONT, BACK or ART_CROP
 * @param url absolute URL or API-relative path (placeholders)
 * @param width pixel width
 * @param height pixel height
 * @param source where the image comes from ({@code placeholder}, provider name, ...)
 */
public record ProviderImage(
        String kind,
        String url,
        @Nullable Integer width,
        @Nullable Integer height,
        String source) {}
