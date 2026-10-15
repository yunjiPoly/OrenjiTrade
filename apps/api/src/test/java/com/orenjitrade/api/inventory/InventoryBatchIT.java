package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code POST /api/v1/inventory/items/batch} (camera scan, owner spec 2026-10-15, section 3.6): new
 * items with the phone's defaults, copies added to an equal item (visibility and binder included),
 * someone else's binder 404, the limit for the whole batch (429, nothing written), validation 400,
 * the event of a public card, the confirmation of a raised item, 401 and the flag.
 */
class InventoryBatchIT extends AbstractIntegrationTest {

    private static final String BATCH = "/api/v1/inventory/items/batch";
    private static final String ITEMS = "/api/v1/inventory/items";

    @Autowired private CatalogImportService importService;
    @Autowired private RecordedDomainEvents events;
    @Autowired private FeatureFlags featureFlags;

    private InventoryTestSupport.IsolatedCard card;
    private UUID other;
    private String uid;
    private UUID ownerId;

    @BeforeEach
    void catalogAndCollector() {
        InventoryTestSupport.ensureCatalog(importService);
        card = InventoryTestSupport.isolatedCard(testUsers, "ygo-p001a");
        other = InventoryTestSupport.siblingPrinting(testUsers, card, "ygo-p001a", null);
        uid = uniqueUid("batch");
        ownerId = provisionCompliant(uid);
    }

    @AfterEach
    void flagOnAndUnlisted() {
        testUsers.update(
                "UPDATE feature_flag SET enabled = true, rollout_percent = 100, updated_by = NULL"
                        + " WHERE key = 'cardTextScan'");
        featureFlags.invalidate();
        callJson(
                HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(false, "MEMBERS"), 200);
    }

    private static Map<String, Object> line(UUID printingId, int quantity) {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("printingId", printingId.toString());
        line.put("quantity", quantity);
        return line;
    }

    private static Map<String, Object> batch(
            @Nullable String visibility,
            @Nullable String binderId,
            List<Map<String, Object>> lines) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (visibility != null) {
            body.put("visibility", visibility);
        }
        if (binderId != null) {
            body.put("binderId", binderId);
        }
        body.put("lines", lines);
        return body;
    }

    private JsonNode add(Map<String, Object> body) {
        return callJson(HttpMethod.POST, BATCH, uid, body, 200);
    }

    private Map<String, Object> row(String itemId) {
        return testUsers
                .query(
                        "SELECT printing_id, quantity, condition, language, edition, finish,"
                            + " availability, accepts_offers, currency, asking_price, visibility,"
                            + " binder_id, freshness_state, confirmed_at, notes, public_notes FROM"
                            + " inventory_item WHERE id = ?",
                        UUID.fromString(itemId))
                .get(0);
    }

    private int liveItems() {
        return testUsers.count(
                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND deleted_at IS NULL",
                ownerId);
    }

    private static List<String> ids(JsonNode array) {
        List<String> ids = new ArrayList<>();
        array.forEach(id -> ids.add(id.asString()));
        return ids;
    }

    private String createBinder(String owner, String name) {
        return callJson(HttpMethod.POST, "/api/v1/binders", owner, binder(name, "PRIVATE"), 201)
                .path("id")
                .asString();
    }

    @Test
    void newCardsGetThePhonesDefaultsAndLinesOfOnePrintingAreSummed() {
        JsonNode added =
                add(
                        batch(
                                null,
                                null,
                                List.of(
                                        line(card.printingId(), 2),
                                        line(other, 1),
                                        line(card.printingId(), 1))));

        assertThat(added.path("itemsCreated").asInt()).isEqualTo(2);
        assertThat(added.path("itemsRaised").asInt()).isZero();
        assertThat(added.path("copiesAdded").asInt()).isEqualTo(4);
        assertThat(added.path("copiesNotAdded").asInt()).isZero();
        assertThat(added.path("raisedItemIds").size()).isZero();
        List<String> created = ids(added.path("createdItemIds"));
        assertThat(created).hasSize(2);
        Map<String, Object> first = row(created.get(0));
        assertThat(first.get("printing_id")).isEqualTo(card.printingId());
        assertThat(first.get("quantity")).isEqualTo(3);
        assertThat(first.get("condition")).isEqualTo("NEAR_MINT");
        assertThat(first.get("availability")).isEqualTo("TRADE_OR_SALE");
        assertThat(first.get("accepts_offers")).isEqualTo(false);
        assertThat(first.get("currency").toString().trim()).isEqualTo("CAD");
        assertThat(first.get("asking_price")).isNull();
        assertThat(first.get("visibility")).isEqualTo("PRIVATE");
        assertThat(first.get("binder_id")).isNull();
        assertThat(first.get("notes")).isEqualTo("");
        assertThat(first.get("public_notes")).isEqualTo("");
        assertThat(first.get("freshness_state")).isEqualTo("ACTIVE");
        assertThat(((Timestamp) first.get("confirmed_at")).toInstant())
                .isAfter(Instant.now().minus(5, ChronoUnit.MINUTES));
        // The printing's language, edition and finish.
        Map<String, Object> printing =
                testUsers
                        .query(
                                "SELECT language, edition, finish FROM card_printing WHERE id = ?",
                                card.printingId())
                        .get(0);
        assertThat(first.get("language")).isEqualTo(printing.get("language"));
        assertThat(first.get("edition")).isEqualTo(printing.get("edition"));
        assertThat(first.get("finish")).isEqualTo(printing.get("finish"));
        assertThat(row(created.get(1)).get("printing_id")).isEqualTo(other);

        // The inventory lists them like any other card.
        JsonNode item = callJson(HttpMethod.GET, ITEMS + "/" + created.get(0), uid, null, 200);
        assertThat(item.path("quantity").asInt()).isEqualTo(3);
    }

    @Test
    void copiesGoToTheEqualItemOfTheSameVisibilityAndBinder() {
        String binderId = createBinder(uid, "Scans");
        String privateItem =
                ids(add(batch(null, null, List.of(line(card.printingId(), 1))))
                                .path("createdItemIds"))
                        .get(0);
        // Another condition and another finish are other items.
        String mint =
                callJson(
                                HttpMethod.POST,
                                ITEMS,
                                uid,
                                Map.of(
                                        "printingId",
                                        card.printingId().toString(),
                                        "condition",
                                        "MINT"),
                                201)
                        .path("id")
                        .asString();
        String foil =
                callJson(
                                HttpMethod.POST,
                                ITEMS,
                                uid,
                                Map.of(
                                        "printingId",
                                        card.printingId().toString(),
                                        "finish",
                                        "FOIL",
                                        "visibility",
                                        "PRIVATE"),
                                201)
                        .path("id")
                        .asString();

        JsonNode again = add(batch("PRIVATE", null, List.of(line(card.printingId(), 2))));
        assertThat(again.path("itemsCreated").asInt()).isZero();
        assertThat(ids(again.path("raisedItemIds"))).containsExactly(privateItem);
        assertThat(row(privateItem).get("quantity")).isEqualTo(3);
        assertThat(row(mint).get("quantity")).isEqualTo(1);
        assertThat(row(foil).get("quantity")).isEqualTo(1);

        // PUBLIC: not the private item.
        String publicItem =
                ids(add(batch("PUBLIC", null, List.of(line(card.printingId(), 1))))
                                .path("createdItemIds"))
                        .get(0);
        assertThat(row(publicItem).get("visibility")).isEqualTo("PUBLIC");
        assertThat(row(privateItem).get("quantity")).isEqualTo(3);

        // In the binder: neither of the unfiled ones, then the filed one.
        String filed =
                ids(add(batch(null, binderId, List.of(line(card.printingId(), 1))))
                                .path("createdItemIds"))
                        .get(0);
        assertThat(row(filed).get("binder_id")).isEqualTo(UUID.fromString(binderId));
        assertThat(row(filed).get("visibility")).isEqualTo("PRIVATE");
        JsonNode filedAgain = add(batch(null, binderId, List.of(line(card.printingId(), 4))));
        assertThat(ids(filedAgain.path("raisedItemIds"))).containsExactly(filed);
        assertThat(row(filed).get("quantity")).isEqualTo(5);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/binders/" + binderId, uid, null, 200)
                                .path("itemCount")
                                .asInt())
                .isEqualTo(1);
        assertThat(row(privateItem).get("quantity")).isEqualTo(3);
        assertThat(row(publicItem).get("quantity")).isEqualTo(1);
    }

    @Test
    void aRaisedItemIsConfirmedAndAHiddenOneComesBack() {
        String id =
                ids(add(batch(null, null, List.of(line(card.printingId(), 1))))
                                .path("createdItemIds"))
                        .get(0);
        testUsers.update(
                "UPDATE inventory_item SET confirmed_at = now() - interval '200 days',"
                        + " freshness_state = 'HIDDEN' WHERE id = ?",
                UUID.fromString(id));

        add(batch(null, null, List.of(line(card.printingId(), 1))));

        Map<String, Object> raised = row(id);
        assertThat(raised.get("quantity")).isEqualTo(2);
        assertThat(raised.get("freshness_state")).isEqualTo("ACTIVE");
        assertThat(((Timestamp) raised.get("confirmed_at")).toInstant())
                .isAfter(Instant.now().minus(5, ChronoUnit.MINUTES));
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_freshness_event WHERE item_id = ?"
                                        + " AND event = 'RESTORED'",
                                UUID.fromString(id)))
                .isEqualTo(1);
    }

    @Test
    void anItemTakesAtMost9999Copies() {
        String id =
                ids(add(batch(null, null, List.of(line(card.printingId(), 9998))))
                                .path("createdItemIds"))
                        .get(0);
        JsonNode raised = add(batch(null, null, List.of(line(card.printingId(), 5))));
        assertThat(raised.path("copiesAdded").asInt()).isEqualTo(1);
        assertThat(raised.path("copiesNotAdded").asInt()).isEqualTo(4);
        assertThat(row(id).get("quantity")).isEqualTo(9999);
    }

    @Test
    void someoneElsesBinderIsNotFoundAndNothingIsWritten() {
        String stranger = uniqueUid("batch-stranger");
        provisionCompliant(stranger);
        String theirs = createBinder(stranger, "Theirs");

        JsonNode refused =
                callJson(
                        HttpMethod.POST,
                        BATCH,
                        uid,
                        batch(null, theirs, List.of(line(card.printingId(), 1))),
                        404);
        assertThat(refused.path("errorCode").asString()).isEqualTo("NOT_FOUND");
        callJson(
                HttpMethod.POST,
                BATCH,
                uid,
                batch(null, UUID.randomUUID().toString(), List.of(line(card.printingId(), 1))),
                404);
        assertThat(liveItems()).isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE binder_id = ?",
                                UUID.fromString(theirs)))
                .isZero();
    }

    @Test
    void theLimitCountsTheWholeBatchAndNothingIsWrittenBeyondIt() {
        String kept =
                ids(add(batch(null, null, List.of(line(card.printingId(), 1))))
                                .path("createdItemIds"))
                        .get(0);
        callJson(
                HttpMethod.POST,
                ITEMS,
                uid,
                Map.of("printingId", card.printingId().toString(), "condition", "MINT"),
                201);
        limitInventory(3);
        UUID third = InventoryTestSupport.siblingPrinting(testUsers, card, "ygo-p001a", "fr");

        // Two new items for one free place: refused as a whole, even the line that raises one.
        JsonNode refused =
                callJson(
                        HttpMethod.POST,
                        BATCH,
                        uid,
                        batch(
                                null,
                                null,
                                List.of(
                                        line(card.printingId(), 2),
                                        line(other, 1),
                                        line(third, 1))),
                        429);
        assertThat(refused.path("errorCode").asString()).isEqualTo("LIMIT_REACHED");
        assertThat(refused.path("limitKey").asString()).isEqualTo("inventory.items.max");
        assertThat(refused.path("limit").asInt()).isEqualTo(3);
        assertThat(refused.path("used").asInt()).isEqualTo(2);
        assertThat(refused.path("requested").asInt()).isEqualTo(2);
        assertThat(liveItems()).as("nothing was written").isEqualTo(2);
        assertThat(row(kept).get("quantity")).isEqualTo(1);

        // One new item and a raised one fit.
        JsonNode fits = add(batch(null, null, List.of(line(card.printingId(), 2), line(other, 1))));
        assertThat(fits.path("itemsCreated").asInt()).isEqualTo(1);
        assertThat(fits.path("itemsRaised").asInt()).isEqualTo(1);
        assertThat(liveItems()).isEqualTo(3);
        // Full: only raising is possible now.
        callJson(HttpMethod.POST, BATCH, uid, batch(null, null, List.of(line(third, 1))), 429);
        assertThat(add(batch(null, null, List.of(line(other, 1)))).path("itemsRaised").asInt())
                .isEqualTo(1);
    }

    @Test
    void badBodiesAre400() {
        callJson(HttpMethod.POST, BATCH, uid, batch(null, null, List.of()), 400);
        List<Map<String, Object>> tooMany = new ArrayList<>();
        for (int i = 0; i < 501; i++) {
            tooMany.add(line(card.printingId(), 1));
        }
        callJson(HttpMethod.POST, BATCH, uid, batch(null, null, tooMany), 400);
        callJson(
                HttpMethod.POST,
                BATCH,
                uid,
                batch(null, null, List.of(line(card.printingId(), 0))),
                400);
        callJson(
                HttpMethod.POST,
                BATCH,
                uid,
                batch(null, null, List.of(line(card.printingId(), 10_000))),
                400);
        JsonNode summed =
                callJson(
                        HttpMethod.POST,
                        BATCH,
                        uid,
                        batch(
                                null,
                                null,
                                List.of(
                                        line(card.printingId(), 5000),
                                        line(card.printingId(), 5000))),
                        400);
        assertThat(summed.toString()).contains("lines[0].quantity");
        JsonNode unknown =
                callJson(
                        HttpMethod.POST,
                        BATCH,
                        uid,
                        batch(
                                null,
                                null,
                                List.of(line(card.printingId(), 1), line(UUID.randomUUID(), 1))),
                        400);
        assertThat(unknown.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(unknown.toString()).contains("lines[1].printingId");
        callJson(
                HttpMethod.POST,
                BATCH,
                uid,
                batch("TEMPORARILY_PUBLIC", null, List.of(line(card.printingId(), 1))),
                400);
        callJson(HttpMethod.POST, BATCH, uid, Map.of("lines", List.of(Map.of("quantity", 1))), 400);
        callJson(HttpMethod.POST, BATCH, uid, Map.of("visibility", "PRIVATE"), 400);
        assertThat(liveItems()).isZero();
    }

    @Test
    void aPublicCardIsPublishedAndAPrivateOneIsNot() {
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);

        String hidden =
                ids(add(batch("PRIVATE", null, List.of(line(other, 1)))).path("createdItemIds"))
                        .get(0);
        String shown =
                ids(add(batch("PUBLIC", null, List.of(line(card.printingId(), 1))))
                                .path("createdItemIds"))
                        .get(0);

        List<InventoryItemPublished> published =
                events.of(
                        InventoryItemPublished.class,
                        event -> event.itemId().toString().equals(shown));
        assertThat(published).hasSize(1);
        assertThat(published.get(0).ownerId()).isEqualTo(ownerId);
        assertThat(published.get(0).printingId()).isEqualTo(card.printingId());
        assertThat(
                        events.of(
                                InventoryItemPublished.class,
                                event -> event.itemId().toString().equals(hidden)))
                .isEmpty();
        // Raising the public card publishes nothing more: it already shows.
        add(batch("PUBLIC", null, List.of(line(card.printingId(), 1))));
        assertThat(
                        events.of(
                                InventoryItemPublished.class,
                                event -> event.itemId().toString().equals(shown)))
                .hasSize(1);
    }

    @Test
    void signedOutIs401AndTheFlagOffIs404() {
        callJson(
                HttpMethod.POST,
                BATCH,
                null,
                batch(null, null, List.of(line(card.printingId(), 1))),
                401);
        testUsers.update("UPDATE feature_flag SET enabled = false WHERE key = 'cardTextScan'");
        featureFlags.invalidate();
        JsonNode off =
                callJson(
                        HttpMethod.POST,
                        BATCH,
                        uid,
                        batch(null, null, List.of(line(card.printingId(), 1))),
                        404);
        assertThat(off.path("errorCode").asString()).isEqualTo("FEATURE_DISABLED");
        assertThat(off.path("feature").asString()).isEqualTo("cardTextScan");
        assertThat(liveItems()).isZero();
    }

    /** Gives this collector alone an inventory limit (an entitlement beats the plan's value). */
    private void limitInventory(int max) {
        String admin = uniqueUid("batch-limit-admin");
        provisionWithRoles(admin, Role.ADMIN);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + ownerId + "/entitlements",
                admin,
                Map.of("featureKey", "inventory.items.max", "value", String.valueOf(max)),
                201);
    }
}
