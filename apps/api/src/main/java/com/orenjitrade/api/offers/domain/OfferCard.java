package com.orenjitrade.api.offers.domain;

import com.orenjitrade.api.notifications.domain.NotificationCards;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/**
 * The card an offer (and the trade it opened) is about: the seller's item, or the snapshot stored
 * with the offer once the item is gone. {@code imageUrl} is the printing's picture from the cards
 * module's {@code CardImageUrlResolver} (ADR 0015: OrenjiTrade's own image route or placeholder,
 * never a re-host-only provider URL).
 *
 * @param name card name ({@value #UNKNOWN_NAME} when neither the item nor a snapshot names it)
 * @param game game slug, {@code null} when unknown
 * @param imageUrl picture URL, {@code null} when unknown
 * @param known whether the card is known
 */
public record OfferCard(
        String name, @Nullable String game, @Nullable String imageUrl, boolean known) {

    /** Name used in texts when the card is unknown. */
    public static final String UNKNOWN_NAME = "a card";

    /** No item and no snapshot (e.g. a purged account's offer without a stored snapshot). */
    public static final OfferCard UNKNOWN = new OfferCard(UNKNOWN_NAME, null, null, false);

    /** A known card. */
    public static OfferCard of(String name, @Nullable String game, @Nullable String imageUrl) {
        return new OfferCard(name, game, imageUrl, true);
    }

    /** Adds {@code cardName}, {@code game} and {@code cardImageUrl} to notification data. */
    public void putInto(Map<String, @Nullable Object> data) {
        if (known) {
            NotificationCards.put(data, name, game, imageUrl);
        }
    }
}
