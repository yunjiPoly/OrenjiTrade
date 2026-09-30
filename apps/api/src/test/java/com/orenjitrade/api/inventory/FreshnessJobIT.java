package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.SERVICE_TOKEN;
import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.binders.events.BinderFreshnessChanged;
import com.orenjitrade.api.binders.events.BinderFreshnessWarning;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.inventory.events.InventoryItemUnpublished;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * The freshness job ({@code POST /internal/jobs/freshness}): states derived from the active delist
 * policy (ACTIVE 0-14, AGING 15-30, STALE 31-45, HIDDEN 46+ days), freshness events, a single
 * warning per confirmation cycle, expiry of temporary publications, never any deletion, and
 * confirmation restoring hidden listings.
 */
class FreshnessJobIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;
    @Autowired private RecordedDomainEvents events;

    private UUID printingId;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        printingId = printing(testUsers, "rb-p013a");
    }

    private JsonNode runJob() {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/jobs/freshness")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result);
    }

    private String listedCollector(String uid) {
        provisionCompliant(uid);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        return me(uid).path("handle").asString();
    }

    private String createItem(String uid, Map<String, Object> extra) {
        Map<String, Object> body = item(printingId);
        body.putAll(extra);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    private void confirmedDaysAgo(String itemId, int days) {
        testUsers.update(
                "UPDATE inventory_item SET confirmed_at = now() - make_interval(days => ?) WHERE"
                        + " id = ?",
                days,
                UUID.fromString(itemId));
    }

    private JsonNode get(String uid, String itemId) {
        return callJson(HttpMethod.GET, "/api/v1/inventory/items/" + itemId, uid, null, 200);
    }

    private List<Object> eventsOf(String targetId) {
        return testUsers
                .query(
                        "SELECT event FROM inventory_freshness_event WHERE item_id = ? OR"
                                + " binder_id = ? ORDER BY created_at, id",
                        UUID.fromString(targetId),
                        UUID.fromString(targetId))
                .stream()
                .map(row -> row.get("event"))
                .toList();
    }

    @Test
    void statesFollowThePolicyAndNothingIsEverDeleted() {
        String uid = uniqueUid("fresh-states");
        listedCollector(uid);
        UUID ownerId = testUsers.idOf(uid);
        String fresh = createItem(uid, Map.of("visibility", "PUBLIC"));
        String aging = createItem(uid, Map.of("visibility", "PUBLIC"));
        String stale = createItem(uid, Map.of("visibility", "PUBLIC"));
        String hidden = createItem(uid, Map.of("visibility", "PUBLIC"));
        confirmedDaysAgo(fresh, 14);
        confirmedDaysAgo(aging, 20);
        confirmedDaysAgo(stale, 35);
        confirmedDaysAgo(hidden, 50);
        int before =
                testUsers.count("SELECT count(*) FROM inventory_item WHERE owner_id = ?", ownerId);

        JsonNode run = runJob();
        assertThat(run.path("itemsAged").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(run.path("itemsStaled").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(run.path("itemsHidden").asInt()).isGreaterThanOrEqualTo(1);

        assertThat(get(uid, fresh).path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(get(uid, aging).path("freshness").path("state").asString()).isEqualTo("AGING");
        assertThat(get(uid, stale).path("freshness").path("state").asString()).isEqualTo("STALE");
        JsonNode hiddenItem = get(uid, hidden);
        assertThat(hiddenItem.path("freshness").path("state").asString()).isEqualTo("HIDDEN");
        assertThat(hiddenItem.path("effectivePublic").asBoolean()).isFalse();
        assertThat(get(uid, stale).path("effectivePublic").asBoolean())
                .as("STALE listings stay public")
                .isTrue();
        assertThat(eventsOf(fresh)).isEmpty();
        assertThat(eventsOf(aging)).containsExactly("AGED");
        assertThat(eventsOf(stale)).containsExactly("STALED");
        assertThat(eventsOf(hidden)).contains("HIDDEN");
        assertThat(
                        testUsers.query(
                                "SELECT hidden_reason FROM inventory_item WHERE id = ?",
                                UUID.fromString(hidden)))
                .extracting(row -> row.get("hidden_reason"))
                .containsExactly("STALE_UNCONFIRMED");
        assertThat(
                        events.of(
                                InventoryItemUnpublished.class,
                                event -> event.itemId().toString().equals(hidden)))
                .hasSize(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ?", ownerId))
                .as("the job never deletes")
                .isEqualTo(before);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE owner_id = ? AND"
                                        + " deleted_at IS NOT NULL",
                                ownerId))
                .isZero();
        assertThat(testUsers.jobRuns("freshness").get(0).get("status")).isEqualTo("SUCCEEDED");

        // A second run changes nothing and records nothing new.
        runJob();
        assertThat(eventsOf(aging)).containsExactly("AGED");
        assertThat(
                        events.of(
                                InventoryItemUnpublished.class,
                                event -> event.itemId().toString().equals(hidden)))
                .hasSize(1);

        // Confirming a hidden item restores it (and publishes it again).
        JsonNode restored =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/inventory/items/" + hidden + "/confirm",
                        uid,
                        null,
                        200);
        assertThat(restored.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(restored.path("effectivePublic").asBoolean()).isTrue();
        assertThat(eventsOf(hidden)).endsWith("RESTORED");
        assertThat(
                        events.of(
                                InventoryItemPublished.class,
                                event -> event.itemId().toString().equals(hidden)))
                .hasSize(2);
    }

    @Test
    void publicListingsAreWarnedOncePerConfirmationCycle() {
        String uid = uniqueUid("fresh-warn");
        listedCollector(uid);
        UUID ownerId = testUsers.idOf(uid);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                binder("Aging binder", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        String inBinder = createItem(uid, Map.of("binderId", binderId));
        String privateItem = createItem(uid, Map.of());
        confirmedDaysAgo(inBinder, 42);
        confirmedDaysAgo(privateItem, 42);

        runJob();
        assertThat(eventsOf(inBinder)).containsExactlyInAnyOrder("STALED", "WARNED");
        assertThat(eventsOf(privateItem))
                .as("private items are not warned")
                .containsExactly("STALED");
        List<BinderFreshnessWarning> warnings =
                events.of(BinderFreshnessWarning.class, event -> event.ownerId().equals(ownerId));
        assertThat(warnings).hasSize(1);
        BinderFreshnessWarning warning = warnings.get(0);
        assertThat(warning.binderId()).isEqualTo(UUID.fromString(binderId));
        assertThat(warning.itemCount()).isEqualTo(1);
        assertThat(warning.hidesAt())
                .isBetween(
                        Instant.now().plus(Duration.ofDays(3)),
                        Instant.now().plus(Duration.ofDays(5)));

        runJob();
        assertThat(eventsOf(inBinder)).containsExactlyInAnyOrder("STALED", "WARNED");
        assertThat(
                        events.of(
                                BinderFreshnessWarning.class,
                                event -> event.ownerId().equals(ownerId)))
                .hasSize(1);

        callJson(
                HttpMethod.POST,
                "/api/v1/inventory/items/" + inBinder + "/confirm",
                uid,
                null,
                200);
        confirmedDaysAgo(inBinder, 43);
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE' WHERE id = ?",
                UUID.fromString(inBinder));
        runJob();
        assertThat(eventsOf(inBinder)).containsExactlyInAnyOrder("STALED", "WARNED", "WARNED");
        assertThat(
                        events.of(
                                BinderFreshnessWarning.class,
                                event -> event.ownerId().equals(ownerId)))
                .hasSize(2);
    }

    @Test
    void expiredTemporaryPublicationsBecomePrivate() {
        String uid = uniqueUid("fresh-expiry");
        String handle = listedCollector(uid);
        String until = Instant.now().plus(Duration.ofHours(2)).toString();
        String temporary =
                createItem(uid, Map.of("visibility", "TEMPORARILY_PUBLIC", "publicUntil", until));
        Map<String, Object> binderBody = binder("Weekend", "TEMPORARILY_PUBLIC");
        binderBody.put("publicUntil", until);
        String binderId =
                callJson(HttpMethod.POST, "/api/v1/binders", uid, binderBody, 201)
                        .path("id")
                        .asString();
        String inBinder = createItem(uid, Map.of("binderId", binderId));
        assertThat(get(uid, temporary).path("effectivePublic").asBoolean()).isTrue();
        assertThat(get(uid, inBinder).path("effectivePublic").asBoolean()).isTrue();

        testUsers.update(
                "UPDATE inventory_item SET public_until = now() - interval '1 minute' WHERE id = ?",
                UUID.fromString(temporary));
        testUsers.update(
                "UPDATE binder SET public_until = now() - interval '1 minute' WHERE id = ?",
                UUID.fromString(binderId));
        // Reads apply the expiry at once, before the job runs.
        assertThat(get(uid, temporary).path("effectivePublic").asBoolean()).isFalse();
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 404);

        JsonNode run = runJob();
        assertThat(run.path("expired").asInt()).isGreaterThanOrEqualTo(2);
        JsonNode item = get(uid, temporary);
        assertThat(item.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(item.path("publicUntil").isNull()).isTrue();
        JsonNode binder = callJson(HttpMethod.GET, "/api/v1/binders/" + binderId, uid, null, 200);
        assertThat(binder.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(binder.path("publicUntil").isNull()).isTrue();
        for (String id : List.of(temporary, inBinder)) {
            assertThat(
                            events.of(
                                    InventoryItemUnpublished.class,
                                    event -> event.itemId().toString().equals(id)))
                    .as("unpublished once: %s", id)
                    .hasSize(1);
        }
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + handle + "/inventory",
                                        null,
                                        null,
                                        200)
                                .path("totalItems")
                                .asLong())
                .isZero();
    }

    @Test
    void binderFreshnessFollowsItsLastConfirmation() {
        String uid = uniqueUid("fresh-binder");
        listedCollector(uid);
        String binderId =
                callJson(HttpMethod.POST, "/api/v1/binders", uid, binder("Old", "PUBLIC"), 201)
                        .path("id")
                        .asString();
        String inBinder = createItem(uid, Map.of("binderId", binderId));
        testUsers.update(
                "UPDATE binder SET confirmed_at = now() - interval '50 days' WHERE id = ?",
                UUID.fromString(binderId));
        confirmedDaysAgo(inBinder, 50);

        runJob();
        JsonNode binder = callJson(HttpMethod.GET, "/api/v1/binders/" + binderId, uid, null, 200);
        assertThat(binder.path("freshness").path("state").asString()).isEqualTo("HIDDEN");
        assertThat(binder.path("effectivePublic").asBoolean()).isFalse();
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 404);
        assertThat(eventsOf(binderId)).containsExactly("HIDDEN");
        assertThat(
                        events.of(
                                BinderFreshnessChanged.class,
                                event -> event.binderId().toString().equals(binderId)))
                .extracting(BinderFreshnessChanged::state)
                .containsExactly(FreshnessState.HIDDEN);

        JsonNode confirmed =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/binders/" + binderId + "/confirm",
                        uid,
                        null,
                        200);
        assertThat(confirmed.path("freshness").path("state").asString()).isEqualTo("ACTIVE");
        assertThat(confirmed.path("effectivePublic").asBoolean()).isTrue();
        assertThat(confirmed.path("publicItemCount").asLong()).isEqualTo(1);
        assertThat(eventsOf(binderId)).containsExactly("HIDDEN", "RESTORED");
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 200);
    }

    @Test
    void jobsNeedServiceCredentials() {
        http.post().uri("/internal/jobs/freshness").exchange().expectStatus().isUnauthorized();
        String uid = uniqueUid("fresh-user");
        provisionCompliant(uid);
        http.post()
                .uri("/internal/jobs/freshness")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isUnauthorized();
        http.post().uri("/internal/jobs/delist").exchange().expectStatus().isUnauthorized();
        EntityExchangeResult<byte[]> delist =
                http.post()
                        .uri("/internal/jobs/delist")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        assertThat(json(delist).path("listingsPaused").asInt()).isZero();
        assertThat(testUsers.jobRuns("delist").get(0).get("status")).isEqualTo("SUCCEEDED");
    }
}
