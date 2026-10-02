package com.orenjitrade.api.cards.domain.provider;

/**
 * How a {@link CardProvider} allows its card images to be shown (ADR 0015).
 *
 * <p>The policy decides which URL clients receive for a provider artwork ({@code
 * CardImageUrlResolver}): never a provider URL for {@link #REHOST_REQUIRED} providers.
 */
public enum ImageHostingPolicy {

    /**
     * The provider forbids hotlinking (YGOPRODeck): images are downloaded once into OrenjiTrade's
     * own capped cache and served from {@code /api/v1/public/card-images/{id}}; while an artwork is
     * not cached, clients get the placeholder. Provider URLs never reach browsers.
     */
    REHOST_REQUIRED,

    /**
     * The provider explicitly allows clients to load its image URLs directly (e.g. a CDN meant for
     * hotlinking). Clients receive the provider URL; nothing is cached locally.
     */
    HOTLINK_ALLOWED
}
