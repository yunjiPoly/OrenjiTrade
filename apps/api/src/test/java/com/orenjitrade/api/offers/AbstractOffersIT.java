package com.orenjitrade.api.offers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the Phase 8 offer and trade integration tests: public listings and private cards of
 * collectors placed around their own random centre (from {@link AbstractPhase7IT}), offer bodies,
 * offer and trade actions, inventory checks and the expiry job.
 */
public abstract class AbstractOffersIT extends AbstractPhase7IT {

    @Autowired protected FeatureFlags featureFlags;

    // ---------------------------------------------------------------------------------------
    // Inventory
    // ---------------------------------------------------------------------------------------

    /** A public unfiled card of {@code seller} with the given availability (offers welcome). */
    protected String listing(Collector seller, String availability, int quantity) {
        return listing(seller, availability, quantity, true);
    }

    /** A public unfiled card of {@code seller}. */
    protected String listing(
            Collector seller, String availability, int quantity, boolean acceptsOffers) {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("availability", availability);
        fields.put("acceptsOffers", acceptsOffers);
        fields.put("quantity", quantity);
        fields.put("askingPrice", new BigDecimal("45.00"));
        fields.put("notes", "Private note of " + seller.handle());
        fields.put("publicNotes", "Pack fresh");
        return publicItem(seller, printing(AZURE), fields);
    }

    /** A private card of {@code owner} (not public; may still be offered in trade). */
    protected String privateCard(Collector owner, int quantity) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("printingId", printing(AZURE_FR).toString());
        body.put("quantity", quantity);
        body.put("visibility", "PRIVATE");
        body.put("notes", "Private note of " + owner.handle());
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", owner.uid(), body, 201)
                .path("id")
                .asString();
    }

    /** Stored quantity of an item. */
    protected int quantityOf(String itemId) {
        return (Integer)
                testUsers
                        .query("SELECT quantity FROM inventory_item WHERE id = ?::uuid", itemId)
                        .get(0)
                        .get("quantity");
    }

    /** Whether an item is soft-deleted. */
    protected boolean deleted(String itemId) {
        return testUsers.count(
                        "SELECT count(*) FROM inventory_item WHERE id = ?::uuid AND deleted_at IS"
                                + " NOT NULL",
                        itemId)
                == 1;
    }

    // ---------------------------------------------------------------------------------------
    // Offers
    // ---------------------------------------------------------------------------------------

    /** A cash offer body. */
    protected static Map<String, Object> cash(String itemId, String amount) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("itemId", itemId);
        body.put("kind", "CASH");
        body.put("cashAmount", new BigDecimal(amount));
        return body;
    }

    /** A trade offer body (one copy of each card). */
    protected static Map<String, Object> trade(String itemId, String... cardIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("itemId", itemId);
        body.put("kind", "TRADE");
        body.put("tradeItemIds", cards(cardIds));
        return body;
    }

    /** A mixed offer body. */
    protected static Map<String, Object> mixed(String itemId, String amount, String... cardIds) {
        Map<String, Object> body = trade(itemId, cardIds);
        body.put("kind", "MIXED");
        body.put("cashAmount", new BigDecimal(amount));
        return body;
    }

    protected static List<Map<String, Object>> cards(String... cardIds) {
        List<Map<String, Object>> cards = new ArrayList<>();
        for (String id : cardIds) {
            cards.add(Map.of("inventoryItemId", id, "quantity", 1));
        }
        return cards;
    }

    protected JsonNode makeOffer(Collector buyer, Map<String, Object> body, int expectedStatus) {
        return callJson(HttpMethod.POST, "/api/v1/offers", buyer.uid(), body, expectedStatus);
    }

    protected JsonNode offer(Collector viewer, String offerId, int expectedStatus) {
        return callJson(
                HttpMethod.GET, "/api/v1/offers/" + offerId, viewer.uid(), null, expectedStatus);
    }

    /** {@code POST /offers/{id}/<action>} with an optional body. */
    protected JsonNode act(
            Collector actor,
            String offerId,
            String action,
            @Nullable Map<String, Object> body,
            int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/offers/" + offerId + "/" + action,
                actor.uid(),
                body,
                expectedStatus);
    }

    /** A counter body with a new cash amount. */
    protected static Map<String, Object> counterCash(String amount) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("cashAmount", new BigDecimal(amount));
        return body;
    }

    /** Actions the viewer may take on an offer. */
    protected static List<String> allowed(JsonNode offer) {
        List<String> actions = new ArrayList<>();
        offer.path("allowedActions").forEach(action -> actions.add(action.asString()));
        return actions;
    }

    /** Events of an offer's history, oldest first (VIEWED entries left out). */
    protected static List<String> history(JsonNode offer) {
        List<String> events = new ArrayList<>();
        for (JsonNode entry : offer.path("history")) {
            if (!"VIEWED".equals(entry.path("event").asString())) {
                events.add(entry.path("event").asString());
            }
        }
        return events;
    }

    /** Stored offer events of a chain (all kinds). */
    protected int storedEvents(String rootOfferId) {
        return testUsers.count(
                "SELECT count(*) FROM offer_event WHERE root_offer_id = ?::uuid", rootOfferId);
    }

    /** Sets a proposal's expiry into the past. */
    protected void expire(String offerId) {
        testUsers.update(
                "UPDATE offer SET expires_at = now() - interval '1 minute' WHERE id = ?::uuid",
                offerId);
    }

    /** Runs {@code POST /internal/jobs/offers-expire} with the service token. */
    protected JsonNode runExpiryJob() {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/jobs/offers-expire")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result);
    }

    // ---------------------------------------------------------------------------------------
    // Trades
    // ---------------------------------------------------------------------------------------

    protected JsonNode trade(Collector viewer, String tradeId, int expectedStatus) {
        return callJson(
                HttpMethod.GET, "/api/v1/trades/" + tradeId, viewer.uid(), null, expectedStatus);
    }

    protected JsonNode tradeAction(
            Collector actor, String tradeId, String action, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/trades/" + tradeId + "/" + action,
                actor.uid(),
                null,
                expectedStatus);
    }

    /** The first timeline entry of a trade with the given event. */
    protected static JsonNode entry(JsonNode trade, String event) {
        for (JsonNode entry : trade.path("timeline")) {
            if (event.equals(entry.path("event").asString())) {
                return entry;
            }
        }
        throw new AssertionError("No " + event + " in " + trade.path("timeline"));
    }

    /** Timeline events of a trade, oldest first. */
    protected static List<String> timeline(JsonNode trade) {
        List<String> events = new ArrayList<>();
        trade.path("timeline").forEach(entry -> events.add(entry.path("event").asString()));
        return events;
    }

    // ---------------------------------------------------------------------------------------
    // Asynchronous side effects
    // ---------------------------------------------------------------------------------------

    /** Waits until the collector has a listed notification of {@code type}. */
    protected JsonNode awaitNotification(Collector collector, String type) {
        await().atMost(WAIT)
                .alias(type + " for " + collector.handle())
                .until(() -> !notificationsOfType(collector, type).isEmpty());
        return notificationsOfType(collector, type).get(0);
    }

    /** SYSTEM messages of the pair conversation as {@code viewer} sees them, newest first. */
    protected List<JsonNode> systemMessages(Collector viewer, Collector other) {
        String conversationId = conversation(viewer, other);
        List<JsonNode> result = new ArrayList<>();
        for (JsonNode message :
                callJson(
                                HttpMethod.GET,
                                "/api/v1/conversations/" + conversationId + "/messages",
                                viewer.uid(),
                                null,
                                200)
                        .path("items")) {
            if ("SYSTEM".equals(message.path("kind").asString())) {
                result.add(message);
            }
        }
        return result;
    }

    /** Waits until the pair conversation shows {@code count} SYSTEM messages. */
    protected List<JsonNode> awaitSystemMessages(Collector viewer, Collector other, int count) {
        await().atMost(WAIT)
                .alias(
                        count
                                + " system messages between "
                                + viewer.handle()
                                + " and "
                                + other.handle())
                .until(() -> systemMessages(viewer, other).size() >= count);
        List<JsonNode> messages = systemMessages(viewer, other);
        assertThat(messages).hasSize(count);
        return messages;
    }

    /** Turns the protectedPayments flag on or off (callers restore it). */
    protected void protectedPayments(boolean enabled) {
        testUsers.update(
                "UPDATE feature_flag SET enabled = ?, rollout_percent = 100 WHERE key ="
                        + " 'protectedPayments'",
                enabled);
        featureFlags.invalidate();
    }

    protected static UUID uuid(JsonNode node) {
        return UUID.fromString(node.asString());
    }
}
