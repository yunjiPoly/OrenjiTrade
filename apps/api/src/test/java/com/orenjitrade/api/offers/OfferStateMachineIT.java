package com.orenjitrade.api.offers;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/**
 * Phase 8 offer state machine over HTTP: OPEN → COUNTERED → (COUNTERED)* → ACCEPTED | DECLINED;
 * OPEN → CANCELLED (buyer) | DECLINED (seller); only current_turn acts; superseded proposals and
 * other versions are stale (409 STALE_OFFER); every transition appends an offer_event.
 */
class OfferStateMachineIT extends AbstractOffersIT {

    @Test
    void cashOfferCounteredTwiceThenAcceptedOpensATrade() {
        Collector seller = member("sm-seller");
        Collector buyer = member("sm-buyer");
        String itemId = listing(seller, "TRADE_OR_SALE", 1);

        Map<String, Object> body = cash(itemId, "40.00");
        body.put("message", "Would you take 40?");
        JsonNode open = makeOffer(buyer, body, 201);
        String rootId = open.path("id").asString();
        assertThat(open.path("status").asString()).isEqualTo("OPEN");
        assertThat(open.path("currentTurn").asString()).isEqualTo("SELLER");
        assertThat(open.path("viewerRole").asString()).isEqualTo("BUYER");
        assertThat(open.path("rootOfferId").asString()).isEqualTo(rootId);
        assertThat(open.path("counterOf").isNull()).isTrue();
        assertThat(open.path("version").asInt()).isZero();
        assertThat(open.path("cashAmount").decimalValue()).isEqualByComparingTo("40.00");
        assertThat(open.path("currency").asString()).isEqualTo("CAD");
        assertThat(open.path("item").path("id").asString()).isEqualTo(itemId);
        assertThat(open.path("seller").path("handle").asString()).isEqualTo(seller.handle());
        assertThat(open.path("message").asString()).isEqualTo("Would you take 40?");
        assertThat(allowed(open)).containsExactly("CANCEL");
        assertThat(history(open)).containsExactly("CREATED");

        JsonNode seen = offer(seller, rootId, 200);
        assertThat(seen.path("viewerRole").asString()).isEqualTo("SELLER");
        assertThat(allowed(seen)).containsExactly("ACCEPT", "COUNTER", "DECLINE");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM offer_event WHERE offer_id = ?::uuid AND"
                                        + " event = 'VIEWED'",
                                rootId))
                .as("the seller's first view is recorded once")
                .isEqualTo(1);
        offer(seller, rootId, 200);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM offer_event WHERE offer_id = ?::uuid AND"
                                        + " event = 'VIEWED'",
                                rootId))
                .isEqualTo(1);

        Map<String, Object> firstCounter = counterCash("48.00");
        firstCounter.put("message", "48 and it is yours");
        firstCounter.put("version", 0);
        JsonNode countered = act(seller, rootId, "counter", firstCounter, 200);
        String counterId = countered.path("id").asString();
        assertThat(counterId).isNotEqualTo(rootId);
        assertThat(countered.path("status").asString()).isEqualTo("COUNTERED");
        assertThat(countered.path("currentTurn").asString()).isEqualTo("BUYER");
        assertThat(countered.path("counterOf").asString()).isEqualTo(rootId);
        assertThat(countered.path("rootOfferId").asString()).isEqualTo(rootId);
        assertThat(countered.path("cashAmount").decimalValue()).isEqualByComparingTo("48.00");
        assertThat(allowed(countered)).isEmpty();
        assertThat(allowed(offer(buyer, counterId, 200)))
                .containsExactly("ACCEPT", "COUNTER", "DECLINE");

        JsonNode superseded = offer(buyer, rootId, 200);
        assertThat(superseded.path("status").asString()).isEqualTo("COUNTERED");
        assertThat(superseded.path("superseded").asBoolean()).isTrue();
        assertThat(superseded.path("latestOfferId").asString()).isEqualTo(counterId);
        assertThat(allowed(superseded)).isEmpty();
        assertThat(superseded.path("closedAt").isNull()).isFalse();

        JsonNode second = act(buyer, counterId, "counter", counterCash("44.00"), 200);
        String secondId = second.path("id").asString();
        assertThat(second.path("currentTurn").asString()).isEqualTo("SELLER");
        assertThat(second.path("counterOf").asString()).isEqualTo(counterId);

        JsonNode accepted = act(seller, secondId, "accept", Map.of("version", 0), 200);
        assertThat(accepted.path("status").asString()).isEqualTo("ACCEPTED");
        assertThat(accepted.path("tradeId").isNull()).isFalse();
        assertThat(allowed(accepted)).isEmpty();
        assertThat(history(accepted))
                .containsExactly("CREATED", "COUNTERED", "COUNTERED", "ACCEPTED");
        JsonNode acceptedEntry = accepted.path("history").get(accepted.path("history").size() - 1);
        assertThat(acceptedEntry.path("actorRole").asString()).isEqualTo("SELLER");
        assertThat(acceptedEntry.path("terms").path("cashAmount").decimalValue())
                .isEqualByComparingTo(new BigDecimal("44.00"));
        assertThat(acceptedEntry.path("terms").path("status").asString()).isEqualTo("ACCEPTED");

        JsonNode trade = trade(buyer, accepted.path("tradeId").asString(), 200);
        assertThat(trade.path("status").asString()).isEqualTo("AGREED");
        assertThat(trade.path("offer").path("id").asString()).isEqualTo(secondId);
        assertThat(trade.path("cashAmount").decimalValue()).isEqualByComparingTo("44.00");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE kind = 'OFFER_ACCEPTED'"
                                        + " AND subject_id = ?::uuid",
                                secondId))
                .isEqualTo(1);
        // CREATED, VIEWED (seller), COUNTERED, VIEWED (buyer), COUNTERED, ACCEPTED
        assertThat(storedEvents(rootId)).isGreaterThanOrEqualTo(4);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM offer_event WHERE root_offer_id = ?::uuid"
                                        + " AND event <> 'VIEWED'",
                                rootId))
                .isEqualTo(4);
    }

    @Test
    void onlyThePartyWhoseTurnItIsMayAct() {
        Collector seller = member("sm2-seller");
        Collector buyer = member("sm2-buyer");
        String itemId = listing(seller, "SALE", 1);
        String rootId = makeOffer(buyer, cash(itemId, "30.00"), 201).path("id").asString();

        assertThat(act(buyer, rootId, "accept", null, 409).path("errorCode").asString())
                .isEqualTo("NOT_YOUR_TURN");
        assertThat(act(buyer, rootId, "decline", null, 409).path("errorCode").asString())
                .isEqualTo("NOT_YOUR_TURN");
        assertThat(
                        act(buyer, rootId, "counter", counterCash("31.00"), 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("NOT_YOUR_TURN");
        assertThat(act(seller, rootId, "cancel", null, 403).path("errorCode").asString())
                .isEqualTo("FORBIDDEN");

        String counterId =
                act(seller, rootId, "counter", counterCash("35.00"), 200).path("id").asString();
        assertThat(act(seller, counterId, "accept", null, 409).path("errorCode").asString())
                .isEqualTo("NOT_YOUR_TURN");
        assertThat(act(buyer, counterId, "cancel", null, 409).path("errorCode").asString())
                .as("a countered negotiation can only be declined")
                .isEqualTo("INVALID_STATE_TRANSITION");
        JsonNode stale = act(seller, rootId, "accept", null, 409);
        assertThat(stale.path("errorCode").asString()).isEqualTo("STALE_OFFER");
        assertThat(stale.path("latestOfferId").asString()).isEqualTo(counterId);
        assertThat(act(buyer, rootId, "decline", null, 409).path("errorCode").asString())
                .isEqualTo("STALE_OFFER");

        JsonNode declined =
                act(buyer, counterId, "decline", Map.of("reason", "Too expensive for me"), 200);
        assertThat(declined.path("status").asString()).isEqualTo("DECLINED");
        JsonNode lastEntry = declined.path("history").get(declined.path("history").size() - 1);
        assertThat(lastEntry.path("event").asString()).isEqualTo("DECLINED");
        assertThat(lastEntry.path("reason").asString()).isEqualTo("Too expensive for me");
        for (String action : List.of("accept", "decline")) {
            assertThat(act(seller, counterId, action, null, 409).path("errorCode").asString())
                    .isEqualTo("INVALID_STATE_TRANSITION");
        }
        assertThat(
                        act(seller, counterId, "counter", counterCash("33.00"), 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("INVALID_STATE_TRANSITION");
        JsonNode closed = act(buyer, counterId, "cancel", null, 409);
        assertThat(closed.path("errorCode").asString()).isEqualTo("INVALID_STATE_TRANSITION");
        assertThat(closed.path("currentStatus").asString()).isEqualTo("DECLINED");
    }

    @Test
    void openOffersAreCancelledByTheBuyerOrDeclinedByTheSeller() {
        Collector seller = member("sm3-seller");
        Collector buyer = member("sm3-buyer");
        String itemId = listing(seller, "TRADE_OR_SALE", 2);

        String cancelledId = makeOffer(buyer, cash(itemId, "20.00"), 201).path("id").asString();
        JsonNode cancelled =
                act(buyer, cancelledId, "cancel", Map.of("reason", "Found one elsewhere"), 200);
        assertThat(cancelled.path("status").asString()).isEqualTo("CANCELLED");
        assertThat(history(cancelled)).containsExactly("CREATED", "CANCELLED");
        assertThat(act(seller, cancelledId, "accept", null, 409).path("errorCode").asString())
                .isEqualTo("INVALID_STATE_TRANSITION");
        assertThat(act(buyer, cancelledId, "cancel", null, 409).path("errorCode").asString())
                .isEqualTo("INVALID_STATE_TRANSITION");

        String declinedId = makeOffer(buyer, cash(itemId, "25.00"), 201).path("id").asString();
        JsonNode declined = act(seller, declinedId, "decline", null, 200);
        assertThat(declined.path("status").asString()).isEqualTo("DECLINED");
        assertThat(history(declined)).containsExactly("CREATED", "DECLINED");
        assertThat(act(seller, declinedId, "accept", null, 409).path("errorCode").asString())
                .isEqualTo("INVALID_STATE_TRANSITION");

        String acceptedId = makeOffer(buyer, cash(itemId, "30.00"), 201).path("id").asString();
        act(seller, acceptedId, "accept", null, 200);
        for (String action : List.of("accept", "decline", "cancel")) {
            Collector actor = "cancel".equals(action) ? buyer : seller;
            assertThat(act(actor, acceptedId, action, null, 409).path("errorCode").asString())
                    .as("ACCEPTED is terminal (%s)", action)
                    .isEqualTo("INVALID_STATE_TRANSITION");
        }
    }

    @Test
    void staleVersionsAndUnchangedCountersAreRefused() {
        Collector seller = member("sm4-seller");
        Collector buyer = member("sm4-buyer");
        String itemId = listing(seller, "TRADE_OR_SALE", 1);
        String card = privateCard(buyer, 2);
        String rootId = makeOffer(buyer, cash(itemId, "40.00"), 201).path("id").asString();

        JsonNode stale = act(seller, rootId, "accept", Map.of("version", 3), 409);
        assertThat(stale.path("errorCode").asString()).isEqualTo("STALE_OFFER");
        assertThat(stale.path("currentVersion").asInt()).isZero();
        Map<String, Object> staleCounter = counterCash("50.00");
        staleCounter.put("version", 7);
        assertThat(act(seller, rootId, "counter", staleCounter, 409).path("errorCode").asString())
                .isEqualTo("STALE_OFFER");
        assertThat(act(seller, rootId, "counter", counterCash("40.00"), 400).path("errors"))
                .as("a counter-offer must change the deal")
                .isNotEmpty();
        assertThat(
                        act(seller, rootId, "counter", counterCash("-1"), 400)
                                .path("errorCode")
                                .asString())
                .isEqualTo("VALIDATION_FAILED");

        // The seller asks for one of the buyer's cards on top (MIXED, kind derived).
        Map<String, Object> withCard = counterCash("30.00");
        withCard.put("tradeItemIds", cards(card));
        JsonNode mixedCounter = act(seller, rootId, "counter", withCard, 200);
        assertThat(mixedCounter.path("kind").asString()).isEqualTo("MIXED");
        assertThat(mixedCounter.path("tradeItems").get(0).path("inventoryItemId").asString())
                .isEqualTo(card);
        assertThat(mixedCounter.path("tradeItems").get(0).path("item").path("binder").isNull())
                .isTrue();
        assertThat(mixedCounter.toString()).doesNotContain("Private note of");
        assertThat(offer(seller, rootId, 200).path("version").asInt())
                .as("the superseded proposal moved to version 1")
                .isEqualTo(1);
        assertThat(
                        act(buyer, rootId, "accept", Map.of("version", 1), 409)
                                .path("errorCode")
                                .asString())
                .as("superseded")
                .isEqualTo("STALE_OFFER");

        // The buyer drops the cash: TRADE.
        Map<String, Object> tradeOnly = new java.util.LinkedHashMap<>();
        tradeOnly.put("kind", "TRADE");
        tradeOnly.put("tradeItemIds", List.of(Map.of("inventoryItemId", card, "quantity", 2)));
        JsonNode tradeCounter =
                act(buyer, mixedCounter.path("id").asString(), "counter", tradeOnly, 200);
        assertThat(tradeCounter.path("kind").asString()).isEqualTo("TRADE");
        assertThat(tradeCounter.path("cashAmount").isNull()).isTrue();
        assertThat(tradeCounter.path("tradeItems").get(0).path("quantity").asInt()).isEqualTo(2);
        JsonNode accepted =
                act(
                        seller,
                        tradeCounter.path("id").asString(),
                        "accept",
                        Map.of("version", 0),
                        200);
        assertThat(accepted.path("status").asString()).isEqualTo("ACCEPTED");
    }
}
