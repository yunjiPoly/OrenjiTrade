package com.orenjitrade.api.offers;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 8 trades: opened by an accepted offer, completed by both parties (inventory quantities
 * transferred, TRADE interaction recorded, both parties may rate), meetups dropping payment
 * protection, cancellation before payment, copies already promised, notifications and SYSTEM
 * messages in the pair conversation.
 */
class TradeLifecycleIT extends AbstractOffersIT {

    @Test
    void completedCashTradeTransfersTheCardAndEnablesRatings() {
        Collector seller = member("tl-seller");
        Collector buyer = member("tl-buyer");
        String itemId = listing(seller, "TRADE_OR_SALE", 2);

        String offerId = makeOffer(buyer, cash(itemId, "40.00"), 201).path("id").asString();
        assertCardPicture(awaitNotification(seller, "OFFER_RECEIVED"), "Azure-Eyes Sky Dragon");
        JsonNode accepted = act(seller, offerId, "accept", null, 200);
        String tradeId = accepted.path("tradeId").asString();

        JsonNode sellerView = trade(seller, tradeId, 200);
        assertThat(sellerView.path("status").asString()).isEqualTo("AGREED");
        assertThat(sellerView.path("viewerRole").asString()).isEqualTo("SELLER");
        assertThat(sellerView.path("counterparty").path("handle").asString())
                .isEqualTo(buyer.handle());
        assertThat(sellerView.path("protectionEnabled").asBoolean()).isFalse();
        assertThat(sellerView.path("nextAction").path("actor").asString()).isEqualTo("SELLER");
        assertThat(sellerView.path("nextAction").path("action").asString()).isEqualTo("MEET");
        assertThat(sellerView.path("payment").isNull()).isTrue();
        assertThat(sellerView.path("dispute").isNull()).isTrue();
        assertThat(timeline(sellerView)).containsExactly("CREATED");
        assertThat(sellerView.toString()).doesNotContain("Private note of");

        JsonNode buyerConfirmed = tradeAction(buyer, tradeId, "complete", 200);
        assertThat(buyerConfirmed.path("status").asString()).isEqualTo("AGREED");
        assertThat(buyerConfirmed.path("buyerConfirmedAt").isNull()).isFalse();
        assertThat(buyerConfirmed.path("nextAction").path("actor").asString()).isEqualTo("SELLER");
        assertThat(buyerConfirmed.path("allowedOperations").toString())
                .doesNotContain("CONFIRM_COMPLETION");
        tradeAction(buyer, tradeId, "complete", 200);
        assertThat(quantityOf(itemId)).as("nothing moves before both confirm").isEqualTo(2);

        JsonNode completed = tradeAction(seller, tradeId, "complete", 200);
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(completed.path("completedAt").isNull()).isFalse();
        assertThat(completed.path("nextAction").path("action").asString()).isEqualTo("NONE");
        assertThat(timeline(completed))
                .containsExactly(
                        "CREATED", "COMPLETION_CONFIRMED", "COMPLETION_CONFIRMED", "COMPLETED");
        JsonNode transfer = entry(completed, "COMPLETED").path("details").path("transfers").get(0);
        assertThat(transfer.path("itemId").asString()).isEqualTo(itemId);
        assertThat(transfer.path("transferred").asInt()).isEqualTo(1);
        assertThat(quantityOf(itemId)).isEqualTo(1);
        assertThat(deleted(itemId)).isFalse();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE kind = 'TRADE' AND"
                                        + " subject_id = ?::uuid",
                                tradeId))
                .isEqualTo(1);

        JsonNode eligibility =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + seller.id(),
                        buyer.uid(),
                        null,
                        200);
        assertThat(eligibility.path("eligible").asBoolean()).isTrue();
        List<String> kinds = new ArrayList<>();
        String tradeInteraction = null;
        for (JsonNode interaction : eligibility.path("interactions")) {
            kinds.add(interaction.path("kind").asString());
            if ("TRADE".equals(interaction.path("kind").asString())) {
                tradeInteraction = interaction.path("id").asString();
            }
        }
        assertThat(kinds).containsExactlyInAnyOrder("TRADE", "OFFER_ACCEPTED");
        assertThat(tradeInteraction).isNotNull();
        Map<String, Object> rating = new java.util.LinkedHashMap<>();
        rating.put("interactionId", tradeInteraction);
        rating.put("overall", 5);
        callJson(HttpMethod.POST, "/api/v1/ratings", buyer.uid(), rating, 201);

        assertCardPicture(awaitNotification(buyer, "OFFER_ACCEPTED"), "Azure-Eyes Sky Dragon");
        awaitNotification(seller, "OFFER_ACCEPTED");
        JsonNode done = awaitNotification(buyer, "TRADE_UPDATE");
        assertThat(done.path("data").path("tradeId").asString()).isEqualTo(tradeId);
        assertCardPicture(done, "Azure-Eyes Sky Dragon");
        awaitNotification(seller, "TRADE_UPDATE");
        List<JsonNode> messages = awaitSystemMessages(buyer, seller, 3);
        JsonNode newest = messages.get(0);
        assertThat(newest.path("senderId").isMissingNode() || newest.path("senderId").isNull())
                .isTrue();
        assertThat(newest.path("body").asString()).startsWith("Trade completed");
        JsonNode link = messages.get(2).path("payload").path("offer");
        assertThat(link.path("id").asString()).isEqualTo(offerId);
        assertThat(link.path("status").asString()).isEqualTo("ACCEPTED");
        assertThat(link.path("summary").asString()).contains("40.00 CAD");
        assertThat(link.path("imageUrl").asString()).matches(CARD_PICTURE);
        assertThat(newest.path("payload").path("offer").path("imageUrl").asString())
                .matches(CARD_PICTURE);

        // Offer links can also be shared by the parties themselves.
        String conversationId = conversation(buyer, seller);
        JsonNode shared =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + conversationId + "/messages",
                        buyer.uid(),
                        Map.of("kind", "OFFER_LINK", "offerId", offerId, "body", "Our deal"),
                        201);
        assertThat(shared.path("payload").path("offer").path("status").asString())
                .isEqualTo("ACCEPTED");
        assertThat(shared.path("payload").path("offer").path("imageUrl").asString())
                .matches(CARD_PICTURE);
        Collector stranger = member("tl-stranger");
        String strangerConversation = conversation(stranger, seller);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + strangerConversation + "/messages",
                stranger.uid(),
                Map.of("kind", "OFFER_LINK", "offerId", offerId),
                400);
    }

    @Test
    void tradeOfferMovesTheLastCopiesOnBothSides() {
        Collector seller = member("tl2-seller");
        Collector buyer = member("tl2-buyer");
        String itemId = listing(seller, "TRADE", 1);
        String card = privateCard(buyer, 1);
        String offerId = makeOffer(buyer, trade(itemId, card), 201).path("id").asString();
        String tradeId = act(seller, offerId, "accept", null, 200).path("tradeId").asString();

        tradeAction(seller, tradeId, "complete", 200);
        JsonNode completed = tradeAction(buyer, tradeId, "complete", 200);
        assertThat(completed.path("status").asString()).isEqualTo("COMPLETED");
        assertThat(deleted(itemId)).as("the seller's last copy left").isTrue();
        assertThat(deleted(card)).as("the buyer's traded card left").isTrue();
        JsonNode transfers = entry(completed, "COMPLETED").path("details").path("transfers");
        assertThat(transfers).hasSize(2);
        assertThat(transfers.get(1).path("from").asString()).isEqualTo("BUYER");
        assertThat(transfers.get(1).path("removed").asBoolean()).isTrue();
        // The deleted cards stay readable for both parties.
        JsonNode offer = offer(buyer, offerId, 200);
        assertThat(offer.path("item").path("id").asString()).isEqualTo(itemId);
        assertThat(offer.path("tradeItems").get(0).path("item").path("id").asString())
                .isEqualTo(card);
        assertThat(publiclyListed(seller, itemId, buyer)).isFalse();
    }

    @Test
    void meetupsDropPaymentProtectionAndTradesCancelBeforePayment() {
        Collector seller = member("tl3-seller");
        Collector buyer = member("tl3-buyer");
        String itemId = listing(seller, "SALE", 1);
        Map<String, Object> body = cash(itemId, "60.00");
        body.put("protectionRequested", true);
        String tradeId;
        try {
            protectedPayments(true);
            String offerId = makeOffer(buyer, body, 201).path("id").asString();
            tradeId = act(seller, offerId, "accept", null, 200).path("tradeId").asString();
        } finally {
            protectedPayments(false);
        }
        JsonNode awaiting = trade(buyer, tradeId, 200);
        assertThat(awaiting.path("status").asString()).isEqualTo("AWAITING_PAYMENT");
        assertThat(awaiting.path("protectionEnabled").asBoolean()).isTrue();
        assertThat(awaiting.path("nextAction").path("actor").asString()).isEqualTo("BUYER");
        assertThat(awaiting.path("nextAction").path("action").asString()).isEqualTo("PAY");
        assertThat(tradeAction(buyer, tradeId, "complete", 409).path("errorCode").asString())
                .isEqualTo("INVALID_STATE_TRANSITION");

        JsonNode proposed = tradeAction(buyer, tradeId, "meetup", 200);
        assertThat(proposed.path("buyerMarkedMeetup").asBoolean()).isTrue();
        assertThat(proposed.path("meetup").asBoolean()).isFalse();
        assertThat(proposed.path("status").asString()).isEqualTo("AWAITING_PAYMENT");
        tradeAction(buyer, tradeId, "meetup", 200);
        JsonNode agreed = tradeAction(seller, tradeId, "meetup", 200);
        assertThat(agreed.path("meetup").asBoolean()).isTrue();
        assertThat(agreed.path("status").asString()).isEqualTo("AGREED");
        assertThat(agreed.path("protectionEnabled").asBoolean()).isFalse();
        assertThat(timeline(agreed))
                .containsExactly(
                        "CREATED", "MEETUP_PROPOSED", "MEETUP_AGREED", "PROTECTION_REMOVED");
        awaitNotification(seller, "TRADE_UPDATE");

        callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/cancel",
                seller.uid(),
                Map.of("reason", ""),
                400);
        JsonNode cancelled =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/trades/" + tradeId + "/cancel",
                        seller.uid(),
                        Map.of("reason", "The card got damaged, sorry"),
                        200);
        assertThat(cancelled.path("status").asString()).isEqualTo("CANCELLED");
        assertThat(cancelled.path("cancelReason").asString())
                .isEqualTo("The card got damaged, sorry");
        assertThat(tradeAction(buyer, tradeId, "complete", 409).path("currentStatus").asString())
                .isEqualTo("CANCELLED");
        tradeAction(buyer, tradeId, "meetup", 409);
        callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/cancel",
                buyer.uid(),
                Map.of("reason", "again"),
                409);
        assertThat(quantityOf(itemId)).isEqualTo(1);
        org.awaitility.Awaitility.await()
                .atMost(WAIT)
                .alias("Trade cancelled notice")
                .until(
                        () ->
                                notificationsOfType(buyer, "TRADE_UPDATE").stream()
                                        .anyMatch(
                                                notice ->
                                                        "Trade cancelled"
                                                                .equals(
                                                                        notice.path("title")
                                                                                .asString())));

        JsonNode trades =
                callJson(HttpMethod.GET, "/api/v1/trades?role=buyer", buyer.uid(), null, 200);
        assertThat(trades.path("items").get(0).path("id").asString()).isEqualTo(tradeId);
        assertThat(trades.path("items").get(0).path("status").asString()).isEqualTo("CANCELLED");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/trades?role=seller",
                                        buyer.uid(),
                                        null,
                                        200)
                                .path("items"))
                .isEmpty();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/trades?status=COMPLETED",
                                        buyer.uid(),
                                        null,
                                        200)
                                .path("items"))
                .isEmpty();
    }

    @Test
    void copiesPromisedInOpenTradesCannotBeAcceptedAgain() {
        Collector seller = member("tl4-seller");
        Collector first = member("tl4-first");
        Collector second = member("tl4-second");
        String itemId = listing(seller, "SALE", 1);
        String firstOffer = makeOffer(first, cash(itemId, "30.00"), 201).path("id").asString();
        String secondOffer = makeOffer(second, cash(itemId, "35.00"), 201).path("id").asString();
        String tradeId = act(seller, firstOffer, "accept", null, 200).path("tradeId").asString();

        assertThat(act(seller, secondOffer, "accept", null, 409).path("errorCode").asString())
                .isEqualTo("ITEM_UNAVAILABLE");
        assertThat(offer(seller, secondOffer, 200).path("status").asString())
                .as("the refused acceptance rolled back")
                .isEqualTo("OPEN");
        callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/cancel",
                first.uid(),
                Map.of("reason", "Changed my mind"),
                200);
        assertThat(act(seller, secondOffer, "accept", null, 200).path("status").asString())
                .isEqualTo("ACCEPTED");
    }
}
