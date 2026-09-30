package com.orenjitrade.api.offers;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 8 offer authorization and listing rules: parties only, anonymous 401, blocks, own cards,
 * the listing's availability and offer switches, the seller's mixed-offer setting, one open offer
 * per buyer and card, payment protection behind its flag, the inbox filters and the
 * Idempotency-Key.
 */
class OfferAuthorizationIT extends AbstractOffersIT {

    @Test
    void anonymousCallersAndStrangersSeeNothing() {
        Collector seller = member("oa-seller");
        Collector buyer = member("oa-buyer");
        Collector stranger = member("oa-stranger");
        String itemId = listing(seller, "SALE", 1);
        String offerId = makeOffer(buyer, cash(itemId, "30.00"), 201).path("id").asString();

        for (String path :
                List.of("/api/v1/offers", "/api/v1/offers/" + offerId, "/api/v1/trades")) {
            assertThat(call(HttpMethod.GET, path, null, null).getStatus().value())
                    .as("anonymous GET %s", path)
                    .isEqualTo(401);
        }
        assertThat(
                        call(HttpMethod.POST, "/api/v1/offers", null, cash(itemId, "10.00"))
                                .getStatus()
                                .value())
                .isEqualTo(401);
        assertThat(
                        call(HttpMethod.POST, "/api/v1/offers/" + offerId + "/accept", null, null)
                                .getStatus()
                                .value())
                .isEqualTo(401);

        offer(stranger, offerId, 404);
        for (String action : List.of("accept", "decline", "cancel")) {
            act(stranger, offerId, action, null, 404);
        }
        act(stranger, offerId, "counter", counterCash("31.00"), 404);
        offer(buyer, UUID.randomUUID().toString(), 404);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/offers", stranger.uid(), null, 200)
                                .path("items"))
                .isEmpty();

        String tradeId = act(seller, offerId, "accept", null, 200).path("tradeId").asString();
        trade(stranger, tradeId, 404);
        tradeAction(stranger, tradeId, "complete", 404);
        tradeAction(stranger, tradeId, "meetup", 404);
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/trades/" + tradeId + "/cancel",
                                        stranger.uid(),
                                        Map.of("reason", "not mine"),
                                        404)
                                .path("errorCode")
                                .asString())
                .isEqualTo("NOT_FOUND");
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/trades", stranger.uid(), null, 200)
                                .path("items"))
                .isEmpty();
    }

    @Test
    void listingRulesDecideWhichOffersAreAccepted() {
        Collector seller = member("oa2-seller");
        Collector buyer = member("oa2-buyer");
        String card = privateCard(buyer, 1);

        String noOffers = listing(seller, "TRADE_OR_SALE", 1, false);
        assertThat(makeOffer(buyer, cash(noOffers, "10.00"), 422).path("errorCode").asString())
                .isEqualTo("OFFERS_NOT_ACCEPTED");
        String collectionOnly = listing(seller, "COLLECTION_ONLY", 1);
        assertThat(
                        makeOffer(buyer, cash(collectionOnly, "10.00"), 422)
                                .path("errorCode")
                                .asString())
                .isEqualTo("OFFERS_NOT_ACCEPTED");
        String tradeOnly = listing(seller, "TRADE", 1);
        assertThat(makeOffer(buyer, cash(tradeOnly, "10.00"), 422).path("message").asString())
                .contains("trade only");
        makeOffer(buyer, trade(tradeOnly, card), 201);
        String saleOnly = listing(seller, "SALE", 1);
        assertThat(makeOffer(buyer, trade(saleOnly, card), 422).path("errorCode").asString())
                .isEqualTo("OFFERS_NOT_ACCEPTED");
        assertThat(
                        makeOffer(buyer, mixed(saleOnly, "5.00", card), 422)
                                .path("errorCode")
                                .asString())
                .isEqualTo("OFFERS_NOT_ACCEPTED");

        String both = listing(seller, "TRADE_OR_SALE", 1);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/offers",
                seller.uid(),
                Map.of("acceptsMixed", false),
                200);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/me/settings/offers",
                                        seller.uid(),
                                        null,
                                        200)
                                .path("acceptsMixed")
                                .asBoolean())
                .isFalse();
        assertThat(makeOffer(buyer, mixed(both, "5.00", card), 422).path("message").asString())
                .contains("mixed");
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/offers",
                seller.uid(),
                Map.of("acceptsMixed", true),
                200);
        JsonNode mixed = makeOffer(buyer, mixed(both, "5.00", card), 201);
        assertThat(mixed.path("kind").asString()).isEqualTo("MIXED");

        // Validation.
        assertThat(makeOffer(buyer, Map.of("kind", "CASH"), 400).path("errorCode").asString())
                .isEqualTo("VALIDATION_FAILED");
        String another = listing(seller, "TRADE_OR_SALE", 1);
        makeOffer(buyer, cash(another, "0.00"), 400);
        makeOffer(buyer, cash(another, "10.001"), 400);
        Map<String, Object> tooLong = cash(another, "10.00");
        tooLong.put("expiresInHours", 169);
        makeOffer(buyer, tooLong, 400);
        Map<String, Object> cashWithCards = cash(another, "10.00");
        cashWithCards.put("tradeItemIds", cards(card));
        makeOffer(buyer, cashWithCards, 400);
        makeOffer(buyer, trade(another), 400);
        Collector other = member("oa2-other");
        String foreign = privateCard(other, 1);
        assertThat(
                        makeOffer(buyer, trade(another, foreign), 400)
                                .path("errors")
                                .get(0)
                                .path("field")
                                .asString())
                .isEqualTo("tradeItemIds");
        Map<String, Object> tooMany = trade(another);
        tooMany.put("tradeItemIds", List.of(Map.of("inventoryItemId", card, "quantity", 3)));
        makeOffer(buyer, tooMany, 400);
        assertThat(
                        makeOffer(seller, cash(another, "10.00"), 400)
                                .path("errors")
                                .get(0)
                                .path("message")
                                .asString())
                .contains("own card");
        makeOffer(buyer, cash(UUID.randomUUID().toString(), "10.00"), 404);
        String privateItem = privateCard(seller, 1);
        makeOffer(buyer, cash(privateItem, "10.00"), 404);
    }

    @Test
    void oneOpenOfferPerBuyerAndCardAndIdempotentRetries() {
        Collector seller = member("oa3-seller");
        Collector buyer = member("oa3-buyer");
        String itemId = listing(seller, "SALE", 1);

        EntityExchangeResult<byte[]> first = offerWithKey(buyer, cash(itemId, "30.00"), "retry-1");
        EntityExchangeResult<byte[]> repeat = offerWithKey(buyer, cash(itemId, "30.00"), "retry-1");
        assertThat(first.getStatus().value()).isEqualTo(201);
        assertThat(repeat.getStatus().value()).isEqualTo(201);
        String offerId = json(first).path("id").asString();
        assertThat(json(repeat).path("id").asString()).isEqualTo(offerId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM offer WHERE buyer_id = ? AND item_id ="
                                        + " ?::uuid",
                                buyer.id(),
                                itemId))
                .isEqualTo(1);

        JsonNode conflict = makeOffer(buyer, cash(itemId, "31.00"), 409);
        assertThat(conflict.path("errorCode").asString()).isEqualTo("OFFER_ALREADY_OPEN");
        assertThat(conflict.path("offerId").asString()).isEqualTo(offerId);

        String counterId =
                act(seller, offerId, "counter", counterCash("40.00"), 200).path("id").asString();
        assertThat(makeOffer(buyer, cash(itemId, "32.00"), 409).path("offerId").asString())
                .as("the countered negotiation is still open")
                .isEqualTo(counterId);
        act(buyer, counterId, "decline", null, 200);
        makeOffer(buyer, cash(itemId, "33.00"), 201);
    }

    @Test
    void blocksHideListingsAndStopNegotiations() {
        Collector seller = member("oa4-seller");
        Collector buyer = member("oa4-buyer");
        String itemId = listing(seller, "SALE", 2);
        String offerId = makeOffer(buyer, cash(itemId, "30.00"), 201).path("id").asString();

        callJson(
                HttpMethod.POST, "/api/v1/users/" + buyer.id() + "/block", seller.uid(), null, 200);
        assertThat(
                        makeOffer(buyer, cash(listing(seller, "SALE", 1), "10.00"), 404)
                                .path("errorCode")
                                .asString())
                .isEqualTo("NOT_FOUND");
        assertThat(
                        act(seller, offerId, "counter", counterCash("35.00"), 403)
                                .path("errorCode")
                                .asString())
                .isEqualTo("TRADING_BLOCKED");
        assertThat(act(seller, offerId, "accept", null, 403).path("errorCode").asString())
                .isEqualTo("TRADING_BLOCKED");
        assertThat(act(seller, offerId, "decline", null, 200).path("status").asString())
                .as("closing stays possible")
                .isEqualTo("DECLINED");
    }

    @Test
    void paymentProtectionNeedsItsFlagAndACashPart() {
        Collector seller = member("oa5-seller");
        Collector buyer = member("oa5-buyer");
        String itemId = listing(seller, "TRADE_OR_SALE", 1);
        String card = privateCard(buyer, 1);
        Map<String, Object> body = cash(itemId, "30.00");
        body.put("protectionRequested", true);
        protectedPayments(false);
        JsonNode disabled = makeOffer(buyer, body, 404);
        assertThat(disabled.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
        assertThat(disabled.path("feature").asString()).isEqualTo("protectedPayments");
        Map<String, Object> tradeBody = trade(itemId, card);
        tradeBody.put("protectionRequested", true);
        makeOffer(buyer, tradeBody, 400);
        try {
            protectedPayments(true);
            JsonNode protectedOffer = makeOffer(buyer, body, 201);
            assertThat(protectedOffer.path("protectionRequested").asBoolean()).isTrue();
        } finally {
            protectedPayments(false);
        }
    }

    @Test
    void theInboxFiltersByRoleAndStatus() {
        Collector seller = member("oa6-seller");
        Collector buyer = member("oa6-buyer");
        String first = listing(seller, "SALE", 1);
        String second = listing(buyer, "SALE", 1);
        String sent = makeOffer(buyer, cash(first, "30.00"), 201).path("id").asString();
        String received = makeOffer(seller, cash(second, "12.00"), 201).path("id").asString();
        act(buyer, received, "decline", null, 200);

        assertThat(ids(inbox(buyer, "?role=buyer"))).containsExactly(sent);
        assertThat(ids(inbox(buyer, "?role=seller"))).containsExactly(received);
        assertThat(ids(inbox(buyer, ""))).containsExactlyInAnyOrder(sent, received);
        assertThat(ids(inbox(buyer, "?status=OPEN,COUNTERED"))).containsExactly(sent);
        assertThat(ids(inbox(buyer, "?status=DECLINED"))).containsExactly(received);
        JsonNode line = inbox(seller, "?role=seller").path("items").get(0);
        assertThat(line.path("counterparty").path("handle").asString()).isEqualTo(buyer.handle());
        assertThat(line.path("yourTurn").asBoolean()).isTrue();
        assertThat(line.path("item").path("id").asString()).isEqualTo(first);
        assertThat(line.toString()).doesNotContain("Private note of");
        callJson(HttpMethod.GET, "/api/v1/offers?role=owner", buyer.uid(), null, 400);
        callJson(HttpMethod.GET, "/api/v1/offers?status=NOPE", buyer.uid(), null, 400);

        JsonNode page = inbox(buyer, "?limit=1");
        assertThat(page.path("hasMore").asBoolean()).isTrue();
        JsonNode next = inbox(buyer, "?limit=1&cursor=" + page.path("nextCursor").asString());
        assertThat(ids(next)).hasSize(1).doesNotContainAnyElementsOf(ids(page));
    }

    private JsonNode inbox(Collector collector, String query) {
        return callJson(HttpMethod.GET, "/api/v1/offers" + query, collector.uid(), null, 200);
    }

    private static List<String> ids(JsonNode page) {
        List<String> ids = new ArrayList<>();
        page.path("items").forEach(item -> ids.add(item.path("id").asString()));
        return ids;
    }

    private EntityExchangeResult<byte[]> offerWithKey(
            Collector buyer, Map<String, Object> body, String key) {
        Map<String, Object> copy = new LinkedHashMap<>(body);
        copy.put("cashAmount", new BigDecimal(body.get("cashAmount").toString()));
        return http.post()
                .uri("/api/v1/offers")
                .header(HttpHeaders.AUTHORIZATION, bearer(buyer.uid()))
                .header("Idempotency-Key", key)
                .contentType(MediaType.APPLICATION_JSON)
                .body(copy)
                .exchange()
                .expectBody()
                .returnResult();
    }
}
