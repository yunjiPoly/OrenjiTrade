package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.png;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.domain.InventoryPhotoPurgeJob;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Stage R2 of the phone redesign (owner spec 2026-10-14, section 12 "Inventory"): the asking price
 * as typed, the card the phone adds (no stated condition, trade or sale, no offers), the save that
 * confirms freshness, the "Recently added" and price sorts, and the undo of a delete with the
 * photos kept for its 10 minutes.
 */
class InventoryPhoneFormIT extends AbstractIntegrationTest {

    private static final String ITEMS = "/api/v1/inventory/items";

    @Autowired private CatalogImportService importService;
    @Autowired private InventoryPhotoPurgeJob photoPurge;

    private UUID azure;
    private UUID emberfang;
    private UUID tidebinder;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        azure = printing(testUsers, "ygo-p001a");
        emberfang = printing(testUsers, "pkm-p001a");
        tidebinder = printing(testUsers, "mtg-p001a");
    }

    /** The body the phone sends for a new card (the fields it shows, and the fixed ones). */
    private static Map<String, Object> phoneCard(
            UUID printingId, @org.jspecify.annotations.Nullable String priceText) {
        Map<String, Object> body = item(printingId);
        body.put("quantity", 2);
        if (priceText != null) {
            body.put("askingPriceText", priceText);
        }
        body.put("visibility", "PRIVATE");
        body.put("publicNotes", "NM, English, 1st, for trade");
        body.put("availability", "TRADE_OR_SALE");
        body.put("acceptsOffers", false);
        body.put("conditionStated", false);
        return body;
    }

    private JsonNode create(String uid, Map<String, Object> body) {
        return callJson(HttpMethod.POST, ITEMS, uid, body, 201);
    }

    @Test
    void aCardAddedOnThePhoneKeepsItsTextPriceAndStatesNoCondition() {
        String uid = uniqueUid("r2-phone-card");
        provisionCompliant(uid);

        JsonNode card = create(uid, phoneCard(azure, "  85% TCG  "));

        assertThat(card.path("askingPriceText").asString())
                .as("trimmed, otherwise exactly as typed")
                .isEqualTo("85% TCG");
        assertThat(card.path("askingPrice").isNull())
                .as("not a plain amount: no numeric price")
                .isTrue();
        assertThat(card.path("currency").asString()).isEqualTo("CAD");
        assertThat(card.path("conditionStated").asBoolean()).isFalse();
        assertThat(card.path("condition").asString())
                .as("the paused web reads a string: empty when not stated")
                .isEmpty();
        assertThat(card.path("availability").asString()).isEqualTo("TRADE_OR_SALE");
        assertThat(card.path("acceptsOffers").asBoolean()).isFalse();
        assertThat(card.path("language").asString()).isEqualTo("en");
        assertThat(card.path("edition").asString()).isEqualTo("FIRST_EDITION");
        assertThat(card.path("finish").asString()).isEqualTo("NORMAL");
        assertThat(card.path("quantity").asInt()).isEqualTo(2);
        assertThat(card.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(card.path("publicNotes").asString()).isEqualTo("NM, English, 1st, for trade");
        UUID id = UUID.fromString(card.path("id").asString());
        assertThat(
                        testUsers.query(
                                "SELECT condition, asking_price_text FROM inventory_item WHERE id"
                                        + " = ?",
                                id))
                .singleElement()
                .satisfies(
                        row -> {
                            assertThat(row.get("condition")).isNull();
                            assertThat(row.get("asking_price_text")).isEqualTo("85% TCG");
                        });

        // A card the web adds still states its condition and has no text.
        JsonNode web = create(uid, item(emberfang));
        assertThat(web.path("condition").asString()).isEqualTo("NEAR_MINT");
        assertThat(web.path("conditionStated").asBoolean()).isTrue();
        assertThat(web.path("askingPriceText").isNull()).isTrue();

        // An edit that changes something else keeps "not stated"; sending a condition states it.
        String uri = ITEMS + "/" + id;
        JsonNode edited = callJson(HttpMethod.PATCH, uri, uid, Map.of("quantity", 3), 200);
        assertThat(edited.path("conditionStated").asBoolean()).isFalse();
        assertThat(edited.path("askingPriceText").asString()).isEqualTo("85% TCG");
        JsonNode stated =
                callJson(HttpMethod.PATCH, uri, uid, Map.of("condition", "LIGHTLY_PLAYED"), 200);
        assertThat(stated.path("condition").asString()).isEqualTo("LIGHTLY_PLAYED");
        assertThat(stated.path("conditionStated").asBoolean()).isTrue();
    }

    @Test
    void aPlainAmountAlsoFillsTheNumericPriceInTheItemsCurrency() {
        String uid = uniqueUid("r2-plain-amount");
        provisionCompliant(uid);
        Map<String, String> amounts = new LinkedHashMap<>();
        amounts.put("12.50", "12.50");
        amounts.put("$12.50", "12.50");
        amounts.put("12,50 $", "12.50");
        amounts.put("12,50 $", "12.50");
        amounts.put("$ 3", "3.00");
        amounts.put("7.5", "7.50");
        for (Map.Entry<String, String> amount : amounts.entrySet()) {
            JsonNode card = create(uid, phoneCard(azure, amount.getKey()));
            assertThat(card.path("askingPriceText").asString())
                    .as("the text of %s", amount.getKey())
                    .isEqualTo(amount.getKey());
            assertThat(card.path("askingPrice").decimalValue())
                    .as("the amount of %s", amount.getKey())
                    .isEqualByComparingTo(amount.getValue());
            assertThat(card.path("currency").asString()).isEqualTo("CAD");
        }
        for (String text : List.of("Trade only", "12.", "1,200.00", "$12$", "12 CAD", "90% TCG")) {
            JsonNode card = create(uid, phoneCard(azure, text));
            assertThat(card.path("askingPriceText").asString()).isEqualTo(text);
            assertThat(card.path("askingPrice").isNull()).as("no amount in %s", text).isTrue();
        }

        // A plain amount keeps the item's currency (an item created in USD stays in USD).
        Map<String, Object> dollars = phoneCard(azure, "$20");
        dollars.put("currency", "USD");
        JsonNode usd = create(uid, dollars);
        assertThat(usd.path("currency").asString()).isEqualTo("USD");
        assertThat(usd.path("askingPrice").decimalValue()).isEqualByComparingTo("20.00");

        // An empty text is no price at all.
        JsonNode blank = create(uid, phoneCard(azure, "   "));
        assertThat(blank.path("askingPriceText").isNull()).isTrue();
        assertThat(blank.path("askingPrice").isNull()).isTrue();
    }

    @Test
    void thePriceTextIsValidated() {
        String uid = uniqueUid("r2-price-invalid");
        provisionCompliant(uid);
        JsonNode tooLong =
                callJson(HttpMethod.POST, ITEMS, uid, phoneCard(azure, "x".repeat(41)), 400);
        assertThat(tooLong.path("errors").toString()).contains("askingPriceText");
        create(uid, phoneCard(azure, "y".repeat(40)));
        callJson(HttpMethod.POST, ITEMS, uid, phoneCard(azure, "85%\nTCG"), 400);

        Map<String, Object> both = phoneCard(azure, "12");
        both.put("askingPrice", 12);
        JsonNode refused = callJson(HttpMethod.POST, ITEMS, uid, both, 400);
        assertThat(refused.path("errors").toString()).contains("askingPriceText");

        Map<String, Object> contradiction = phoneCard(azure, null);
        contradiction.put("condition", "NEAR_MINT");
        JsonNode condition = callJson(HttpMethod.POST, ITEMS, uid, contradiction, 400);
        assertThat(condition.path("errors").toString()).contains("condition");

        String id = create(uid, phoneCard(azure, "5")).path("id").asString();
        Map<String, Object> patchBoth = new LinkedHashMap<>();
        patchBoth.put("askingPrice", 3);
        patchBoth.put("askingPriceText", "3");
        callJson(HttpMethod.PATCH, ITEMS + "/" + id, uid, patchBoth, 400);
    }

    @Test
    void anEditOfThePriceKeepsTextAndAmountTogether() {
        String uid = uniqueUid("r2-price-patch");
        provisionCompliant(uid);
        String uri = ITEMS + "/" + create(uid, phoneCard(azure, "85% TCG")).path("id").asString();

        JsonNode amount =
                callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPriceText", "$9"), 200);
        assertThat(amount.path("askingPriceText").asString()).isEqualTo("$9");
        assertThat(amount.path("askingPrice").decimalValue()).isEqualByComparingTo("9.00");

        JsonNode text =
                callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPriceText", "Trade only"), 200);
        assertThat(text.path("askingPriceText").asString()).isEqualTo("Trade only");
        assertThat(text.path("askingPrice").isNull()).isTrue();

        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("askingPriceText", null);
        JsonNode cleared = callJson(HttpMethod.PATCH, uri, uid, clear, 200);
        assertThat(cleared.path("askingPriceText").isNull()).isTrue();
        assertThat(cleared.path("askingPrice").isNull()).isTrue();

        // The paused web edits the amount: the text no longer says the same and is dropped.
        callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPriceText", "90% TCG"), 200);
        JsonNode web = callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPrice", 14.25), 200);
        assertThat(web.path("askingPrice").decimalValue()).isEqualByComparingTo("14.25");
        assertThat(web.path("askingPriceText").isNull()).isTrue();
    }

    @Test
    void emptyingThePriceOnEditCardClearsTheAmountItGave() {
        String uid = uniqueUid("r2-price-empty");
        provisionCompliant(uid);
        String uri = ITEMS + "/" + create(uid, phoneCard(azure, "$12.50")).path("id").asString();
        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("askingPriceText", null);

        // A plain amount typed on the phone, then the field emptied (Edit card sends null).
        JsonNode cleared = callJson(HttpMethod.PATCH, uri, uid, clear, 200);
        assertThat(cleared.path("askingPriceText").isNull()).isTrue();
        assertThat(cleared.path("askingPrice").isNull()).isTrue();
        assertThat(callJson(HttpMethod.GET, uri, uid, null, 200).path("askingPrice").isNull())
                .isTrue();

        // Only blanks typed: the same as an empty field.
        callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPriceText", "$9"), 200);
        JsonNode blanks =
                callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPriceText", "   "), 200);
        assertThat(blanks.path("askingPriceText").isNull()).isTrue();
        assertThat(blanks.path("askingPrice").isNull()).isTrue();

        // A card priced on the paused web (an amount, no text), emptied on the phone.
        callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPrice", 14.25), 200);
        Map<String, Object> phone = new LinkedHashMap<>(clear);
        phone.put("confirm", true);
        JsonNode webPriced = callJson(HttpMethod.PATCH, uri, uid, phone, 200);
        assertThat(webPriced.path("askingPriceText").isNull()).isTrue();
        assertThat(webPriced.path("askingPrice").isNull()).isTrue();

        // An edit that does not touch the price keeps it.
        callJson(HttpMethod.PATCH, uri, uid, Map.of("askingPriceText", "$7"), 200);
        JsonNode kept = callJson(HttpMethod.PATCH, uri, uid, Map.of("quantity", 2), 200);
        assertThat(kept.path("askingPriceText").asString()).isEqualTo("$7");
        assertThat(kept.path("askingPrice").decimalValue()).isEqualByComparingTo("7.00");
    }

    @Test
    void aSaveFromEditCardConfirmsTheCardLikeStillAvailable() {
        String uid = uniqueUid("r2-save-confirms");
        provisionCompliant(uid);
        String id = create(uid, phoneCard(azure, "85% TCG")).path("id").asString();
        UUID itemId = UUID.fromString(id);
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN', hidden_reason ="
                        + " 'STALE_UNCONFIRMED', confirmed_at = now() - interval '60 days' WHERE"
                        + " id = ?",
                itemId);

        // A save without confirm (the paused web) leaves the freshness alone.
        JsonNode web =
                callJson(HttpMethod.PATCH, ITEMS + "/" + id, uid, Map.of("quantity", 3), 200);
        assertThat(web.path("freshness").path("state").asString()).isEqualTo("HIDDEN");

        Map<String, Object> phone = new LinkedHashMap<>();
        phone.put("askingPriceText", "80% TCG");
        phone.put("confirm", true);
        JsonNode saved = callJson(HttpMethod.PATCH, ITEMS + "/" + id, uid, phone, 200);
        assertThat(saved.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(saved.path("freshness").path("label").asString()).isEqualTo("Updated just now");
        assertThat(
                        testUsers.query(
                                "SELECT event FROM inventory_freshness_event WHERE item_id = ?",
                                itemId))
                .extracting(row -> row.get("event"))
                .containsExactly("RESTORED");
        callJson(HttpMethod.PATCH, ITEMS + "/" + id, uid, Map.of("confirm", "yes"), 400);
    }

    @Test
    void recentlyAddedAndThePriceSortKeepPlainAmountsFirst() {
        String uid = uniqueUid("r2-sorts");
        provisionCompliant(uid);
        String cheap = create(uid, phoneCard(azure, "$5")).path("id").asString();
        String text = create(uid, phoneCard(emberfang, "85% TCG")).path("id").asString();
        String none = create(uid, phoneCard(tidebinder, null)).path("id").asString();
        String dear = create(uid, phoneCard(azure, "20")).path("id").asString();
        // Distinct creation times, the oldest first, whatever the clock's resolution.
        String[] order = {cheap, text, none, dear};
        for (int i = 0; i < order.length; i++) {
            testUsers.update(
                    "UPDATE inventory_item SET created_at = now() - make_interval(mins => ?)"
                            + " WHERE id = ?",
                    10 - i,
                    UUID.fromString(order[i]));
        }
        // An older card touched last: "Recently added" is about creation, not edits.
        callJson(HttpMethod.PATCH, ITEMS + "/" + cheap, uid, Map.of("quantity", 4), 200);

        assertThat(ids(callJson(HttpMethod.GET, ITEMS + "?sort=created", uid, null, 200)))
                .containsExactly(dear, none, text, cheap);
        assertThat(ids(callJson(HttpMethod.GET, ITEMS + "?sort=price", uid, null, 200)))
                .containsExactly(dear, cheap, text, none);
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        ITEMS + "?sort=price&direction=asc",
                                        uid,
                                        null,
                                        200)))
                .containsExactly(cheap, dear, text, none);
        callJson(HttpMethod.GET, ITEMS + "?sort=oldest", uid, null, 400);
    }

    @Test
    void anOwnersDeleteCanBeUndoneForTenMinutesWithEverythingItHad() {
        String uid = uniqueUid("r2-restore");
        provisionCompliant(uid);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "PUBLIC"), 200);
        String handle = me(uid).path("handle").asString();
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                InventoryTestSupport.binder("For trade", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> body = phoneCard(azure, "85% TCG");
        body.put("visibility", "PUBLIC");
        body.put("binderId", binderId);
        String id = create(uid, body).path("id").asString();
        String uri = ITEMS + "/" + id;
        String photoUrl =
                upload(uid, uri + "/images", 201).path("images").get(0).path("url").asString();
        upload(uid, uri + "/images", 201);
        assertThat(publicInventory(handle)).contains(id);
        assertThat(binderCount(binderId)).isEqualTo(1);

        callJson(HttpMethod.DELETE, uri, uid, null, 204);
        callJson(HttpMethod.GET, uri, uid, null, 404);
        assertThat(publicInventory(handle)).doesNotContain(id);
        assertThat(binderCount(binderId)).isZero();
        assertThat(photoStatus(photoUrl)).as("kept for the undo").isEqualTo(200);

        // Nobody else can restore it, and the hourly purge leaves it alone within the window.
        String other = uniqueUid("r2-restore-other");
        provisionCompliant(other);
        callJson(HttpMethod.POST, uri + "/restore", other, null, 404);
        photoPurge.run();
        assertThat(photoStatus(photoUrl)).isEqualTo(200);

        JsonNode restored = callJson(HttpMethod.POST, uri + "/restore", uid, null, 200);
        assertThat(restored.path("id").asString()).isEqualTo(id);
        assertThat(restored.path("quantity").asInt()).isEqualTo(2);
        assertThat(restored.path("askingPriceText").asString()).isEqualTo("85% TCG");
        assertThat(restored.path("publicNotes").asString())
                .isEqualTo("NM, English, 1st, for trade");
        assertThat(restored.path("visibility").asString()).isEqualTo("PUBLIC");
        assertThat(restored.path("binder").path("id").asString()).isEqualTo(binderId);
        assertThat(restored.path("images").size()).isEqualTo(2);
        assertThat(restored.path("effectivePublic").asBoolean()).isTrue();
        assertThat(publicInventory(handle)).contains(id);
        assertThat(binderCount(binderId)).isEqualTo(1);
        assertThat(photoStatus(photoUrl)).isEqualTo(200);

        // A repeated undo answers the card as it is; an unknown id is 404.
        assertThat(
                        callJson(HttpMethod.POST, uri + "/restore", uid, null, 200)
                                .path("id")
                                .asString())
                .isEqualTo(id);
        callJson(HttpMethod.POST, ITEMS + "/" + UUID.randomUUID() + "/restore", uid, null, 404);
    }

    @Test
    void afterTenMinutesTheDeleteIsFinalAndThePhotosAreDeleted() {
        String uid = uniqueUid("r2-restore-late");
        provisionCompliant(uid);
        String id = create(uid, phoneCard(azure, "$4")).path("id").asString();
        String uri = ITEMS + "/" + id;
        String photoUrl =
                upload(uid, uri + "/images", 201).path("images").get(0).path("url").asString();
        callJson(HttpMethod.DELETE, uri, uid, null, 204);
        UUID itemId = UUID.fromString(id);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ? AND"
                                        + " restorable_until BETWEEN deleted_at + interval '9"
                                        + " minutes 59 seconds' AND deleted_at + interval '10"
                                        + " minutes 1 second'",
                                itemId))
                .as("restorable for 10 minutes")
                .isEqualTo(1);

        // Eleven minutes later.
        testUsers.update(
                "UPDATE inventory_item SET deleted_at = now() - interval '11 minutes',"
                        + " restorable_until = now() - interval '1 minute' WHERE id = ?",
                itemId);
        JsonNode closed = callJson(HttpMethod.POST, uri + "/restore", uid, null, 409);
        assertThat(closed.path("errorCode").asString()).isEqualTo("RESTORE_WINDOW_CLOSED");
        assertThat(photoStatus(photoUrl)).as("until the purge runs").isEqualTo(200);

        assertThat(photoPurge.run()).isGreaterThanOrEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item_image WHERE item_id = ?",
                                itemId))
                .isZero();
        assertThat(photoStatus(photoUrl)).isEqualTo(404);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ? AND"
                                        + " restorable_until IS NULL AND deleted_at IS NOT NULL",
                                itemId))
                .isEqualTo(1);
        assertThat(
                        callJson(HttpMethod.POST, uri + "/restore", uid, null, 409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("RESTORE_WINDOW_CLOSED");
        assertThat(testUsers.jobRuns(InventoryPhotoPurgeJob.NAME))
                .first()
                .satisfies(row -> assertThat(row.get("status")).isEqualTo("SUCCEEDED"));
    }

    /**
     * The photo purge has no schedule of its own: the hourly freshness job ({@code POST
     * /internal/jobs/freshness}, Cloud Scheduler) runs it. Without that, the photos of deleted
     * cards would stay (and stay reachable by their address) for ever.
     */
    @Test
    void theHourlyFreshnessJobRunsThePhotoPurge() {
        String uid = uniqueUid("r2-restore-hourly");
        provisionCompliant(uid);
        String id = create(uid, phoneCard(azure, "$3")).path("id").asString();
        String uri = ITEMS + "/" + id;
        String photoUrl =
                upload(uid, uri + "/images", 201).path("images").get(0).path("url").asString();
        callJson(HttpMethod.DELETE, uri, uid, null, 204);
        UUID itemId = UUID.fromString(id);
        testUsers.update(
                "UPDATE inventory_item SET deleted_at = now() - interval '11 minutes',"
                        + " restorable_until = now() - interval '1 minute' WHERE id = ?",
                itemId);
        int purgesBefore = testUsers.jobRuns(InventoryPhotoPurgeJob.NAME).size();

        http.post()
                .uri("/internal/jobs/freshness")
                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, InventoryTestSupport.SERVICE_TOKEN)
                .exchange()
                .expectStatus()
                .isOk();

        assertThat(testUsers.jobRuns(InventoryPhotoPurgeJob.NAME))
                .as("the freshness run started a photo purge")
                .hasSize(purgesBefore + 1)
                .first()
                .satisfies(row -> assertThat(row.get("status")).isEqualTo("SUCCEEDED"));
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item_image WHERE item_id = ?",
                                itemId))
                .isZero();
        assertThat(photoStatus(photoUrl)).isEqualTo(404);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ? AND"
                                        + " restorable_until IS NULL",
                                itemId))
                .isEqualTo(1);
    }

    @Test
    void aBulkDeleteIsRestorableCardByCardAndADeletedBinderEndsTheUndo() {
        String uid = uniqueUid("r2-restore-bulk");
        provisionCompliant(uid);
        String first = create(uid, phoneCard(azure, "1")).path("id").asString();
        String second = create(uid, phoneCard(emberfang, "2")).path("id").asString();
        JsonNode bulk =
                callJson(
                        HttpMethod.POST,
                        ITEMS + "/bulk",
                        uid,
                        Map.of("action", "DELETE", "itemIds", List.of(first, second)),
                        200);
        assertThat(bulk.path("updated").asInt()).isEqualTo(2);
        callJson(HttpMethod.POST, ITEMS + "/" + first + "/restore", uid, null, 200);
        callJson(HttpMethod.POST, ITEMS + "/" + second + "/restore", uid, null, 200);
        assertThat(ids(callJson(HttpMethod.GET, ITEMS, uid, null, 200)))
                .containsExactlyInAnyOrder(first, second);

        // A card deleted from a binder, then the binder deleted: it cannot come back to it.
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                InventoryTestSupport.binder("Staples", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> filed = phoneCard(tidebinder, "3");
        filed.put("binderId", binderId);
        String inBinder = create(uid, filed).path("id").asString();
        String photoUrl =
                upload(uid, ITEMS + "/" + inBinder + "/images", 201)
                        .path("images")
                        .get(0)
                        .path("url")
                        .asString();
        callJson(HttpMethod.DELETE, ITEMS + "/" + inBinder, uid, null, 204);
        callJson(HttpMethod.DELETE, "/api/v1/binders/" + binderId, uid, null, 204);
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        ITEMS + "/" + inBinder + "/restore",
                                        uid,
                                        null,
                                        409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("RESTORE_WINDOW_CLOSED");
        assertThat(photoStatus(photoUrl)).isEqualTo(404);
    }

    @Test
    void aNotStatedConditionIsAPossibleMatchForNearMintOnlyWishes() {
        // The rule itself: WishlistRulesTest; the alert end to end: WishlistAlertsIT. Here the
        // listing side: a card added on the phone is listed with conditionStated false.
        String uid = uniqueUid("r2-listed-not-stated");
        provisionCompliant(uid);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "PUBLIC"), 200);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> body = phoneCard(azure, "85% TCG");
        body.put("visibility", "PUBLIC");
        String id = create(uid, body).path("id").asString();
        JsonNode listed = null;
        for (JsonNode candidate :
                callJson(
                                HttpMethod.GET,
                                "/api/v1/collectors/" + handle + "/inventory?size=100",
                                null,
                                null,
                                200)
                        .path("items")) {
            if (candidate.path("id").asString().equals(id)) {
                listed = candidate;
            }
        }
        assertThat(listed).isNotNull();
        assertThat(listed.path("conditionStated").asBoolean()).isFalse();
        assertThat(listed.path("condition").asString()).isEmpty();
        assertThat(listed.path("askingPriceText").asString()).isEqualTo("85% TCG");
    }

    private List<String> publicInventory(String handle) {
        return ids(
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + handle + "/inventory?size=100",
                        null,
                        null,
                        200));
    }

    private int binderCount(String binderId) {
        return testUsers.count(
                "SELECT item_count FROM binder WHERE id = ?", UUID.fromString(binderId));
    }

    private int photoStatus(String url) {
        return http.get()
                .uri(URI.create(url).getPath())
                .exchange()
                .expectBody()
                .returnResult()
                .getStatus()
                .value();
    }

    private JsonNode upload(String uid, String uri, int expectedStatus) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(png(64, 64)) {
                            @Override
                            public String getFilename() {
                                return "card.png";
                            }
                        })
                .contentType(MediaType.IMAGE_PNG);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri(uri)
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).isEqualTo(expectedStatus);
        return json(result);
    }
}
