package com.orenjitrade.api.offers;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/**
 * Phase 8 {@code offers.per_day} (ADR 0014, {@code usage_limit} FREE 20): new offers consume the
 * buyer's daily counter through {@code Limits}; the 21st of a UTC day is 429 LIMIT_REACHED with the
 * limit extensions; answering offers (counter-offers) does not count and refused offers consume
 * nothing.
 */
class OfferLimitIT extends AbstractOffersIT {

    @Test
    void freeCollectorsMakeTwentyOffersPerDay() {
        Collector seller = member("ol-seller");
        Collector buyer = member("ol-buyer");
        String itemId = listing(seller, "SALE", 1);
        String noOffers = listing(seller, "SALE", 1, false);

        makeOffer(buyer, cash(noOffers, "5.00"), 422);
        String last = null;
        for (int index = 0; index < 20; index++) {
            if (last != null) {
                act(buyer, last, "cancel", null, 200);
            }
            last = makeOffer(buyer, cash(itemId, (10 + index) + ".00"), 201).path("id").asString();
        }
        act(buyer, last, "cancel", null, 200);

        JsonNode limited = makeOffer(buyer, cash(itemId, "40.00"), 429);
        assertThat(limited.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(limited.path("limitKey").asString()).isEqualTo("offers.per_day");
        assertThat(limited.path("limit").asInt()).isEqualTo(20);
        assertThat(limited.path("used").asInt()).isEqualTo(20);
        assertThat(limited.path("upgradeUrl").asString()).isNotBlank();

        // The seller still answers offers of other buyers (counters are not offers of theirs).
        Collector other = member("ol-other");
        String offerId = makeOffer(other, cash(itemId, "25.00"), 201).path("id").asString();
        String counterId =
                act(seller, offerId, "counter", counterCash("28.00"), 200).path("id").asString();
        // The limited buyer can answer a counter-offer too.
        String sellerItem = listing(buyer, "SALE", 1);
        String reverse = makeOffer(seller, cash(sellerItem, "9.00"), 201).path("id").asString();
        act(buyer, reverse, "counter", counterCash("11.00"), 200);
        assertThat(counterId).isNotBlank();
    }
}
