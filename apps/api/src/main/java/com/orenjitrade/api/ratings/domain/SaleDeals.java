package com.orenjitrade.api.ratings.domain;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Extension point implemented by the deals module (stage R14 of the phone redesign): what a {@code
 * SALE} interaction was, so the rating form can name the deal ("{card} · sold to you {date}").
 * Ratings reads it without depending on the module that records sales (deals depends on ratings for
 * its interactions).
 */
public interface SaleDeals {

    /** The sales among {@code saleIds} that still exist, by id (an unknown id is left out). */
    Map<UUID, Deal> deals(Collection<UUID> saleIds);

    /**
     * A sale as the rating form names it.
     *
     * @param name the card or deck core at the time of the sale
     * @param sellerId the seller
     * @param buyerId the buyer
     */
    record Deal(String name, UUID sellerId, UUID buyerId) {}
}
