package com.orenjitrade.api.messaging.domain;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * Extension point of OFFER_LINK and SYSTEM messages (Phase 8): the current state of the offers a
 * message links, implemented by the offers module. Without an implementation offer links keep the
 * state stored with the message and OFFER_LINK messages cannot be sent.
 */
public interface OfferLinkResolver {

    /**
     * The current state of offers as seen by {@code viewerId}: for each requested offer the live
     * proposal of its counter chain (id, status and a short summary of the terms). Offers that do
     * not exist or where the viewer is not a party are absent.
     */
    Map<UUID, OfferLink> links(UUID viewerId, Collection<UUID> offerIds);

    /**
     * Whether {@code one} and {@code other} are the two parties (buyer and seller) of the offer.
     */
    boolean isBetween(UUID offerId, UUID one, UUID other);
}
