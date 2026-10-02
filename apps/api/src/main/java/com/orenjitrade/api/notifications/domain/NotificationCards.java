package com.orenjitrade.api.notifications.domain;

import com.orenjitrade.api.cards.domain.CatalogImages;
import java.util.LinkedHashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * The card a notification is about (ADR 0015): notifications concerning one card (WISHLIST_MATCH,
 * the OFFER_* types, TRADE_UPDATE, PAYMENT_UPDATE, SHIPMENT_STATUS, DISPUTE_UPDATE) carry {@value
 * #CARD_NAME}, {@value #CARD_IMAGE_URL} and {@value #GAME} in their {@code data} so clients show
 * the card's picture. The URL always comes from the cards module's {@code CardImageUrlResolver}
 * (OrenjiTrade's own image route or placeholder, never a re-host-only provider URL); it is stored
 * as produced, which is an API-relative path outside a request (after-commit listeners), and made
 * absolute against the request origin when the notification centre lists it.
 */
public final class NotificationCards {

    /** Card name (alt text of the picture). */
    public static final String CARD_NAME = "cardName";

    /** Picture URL from {@code CardImageUrlResolver}. */
    public static final String CARD_IMAGE_URL = "cardImageUrl";

    /** Game slug (placeholder tint). */
    public static final String GAME = "game";

    private NotificationCards() {}

    /**
     * Adds the card to a notification's data; absent values are left out (an unknown card adds
     * nothing).
     */
    public static void put(
            Map<String, @Nullable Object> data,
            @Nullable String cardName,
            @Nullable String game,
            @Nullable String imageUrl) {
        if (cardName != null && !cardName.isBlank()) {
            data.put(CARD_NAME, cardName);
        }
        if (game != null && !game.isBlank()) {
            data.put(GAME, game);
        }
        if (imageUrl != null && !imageUrl.isBlank()) {
            data.put(CARD_IMAGE_URL, imageUrl);
        }
    }

    /**
     * The data as clients receive it: an API-relative {@value #CARD_IMAGE_URL} becomes absolute
     * against the current request's origin (unchanged outside a request, e.g. realtime pushes,
     * which clients resolve against the API origin).
     */
    static Map<String, Object> forClients(Map<String, Object> data) {
        if (!(data.get(CARD_IMAGE_URL) instanceof String url)
                || !url.startsWith("/")
                || url.startsWith("//")) {
            return data;
        }
        Map<String, Object> resolved = new LinkedHashMap<>(data);
        resolved.put(CARD_IMAGE_URL, CatalogImages.resolve(url));
        return resolved;
    }
}
