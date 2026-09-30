package com.orenjitrade.api.offers.domain;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Extension point of offer acceptance (Phase 8): opens the trade of an accepted offer. Implemented
 * by the trades module, which depends on this one (dependency inversion: the offers module never
 * reads trade tables).
 */
public interface AcceptedOfferHandler {

    /**
     * Opens the trade of an accepted proposal inside the caller's transaction (AGREED, or
     * AWAITING_PAYMENT with payment protection). May refuse with an {@code ApiException} (409
     * ITEM_UNAVAILABLE when every copy of the card is already promised in open trades), which rolls
     * the acceptance back.
     *
     * @return the new trade's id
     */
    UUID openTrade(AcceptedOffer offer);

    /** The trades of accepted proposals, by proposal id (absent: no trade). */
    Map<UUID, UUID> tradeIdsByOffer(Collection<UUID> offerIds);
}
