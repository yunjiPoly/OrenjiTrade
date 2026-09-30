package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.binders.events.BinderPublished;
import com.orenjitrade.api.binders.events.BinderUnpublished;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.domain.Availability;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.inventory.events.InventoryItemUnpublished;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;

/**
 * Domain events of Phase 3: {@code InventoryItemPublished} / {@code InventoryItemUnpublished} and
 * {@code BinderPublished} / {@code BinderUnpublished} are emitted exactly once per visibility
 * transition, whatever causes it (item writes, binder publication, deletion, the owner's privacy
 * settings or account state), and never for writes that do not change visibility.
 */
class EventsIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;
    @Autowired private RecordedDomainEvents events;

    private UUID printingId;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        printingId = printing(testUsers, "ygo-p014a");
    }

    private void listed(String uid) {
        provisionCompliant(uid);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
    }

    private String createItem(String uid, Map<String, Object> extra) {
        Map<String, Object> body = item(printingId);
        body.putAll(extra);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    private List<InventoryItemPublished> published(String itemId) {
        return events.of(
                InventoryItemPublished.class, event -> event.itemId().toString().equals(itemId));
    }

    private List<InventoryItemUnpublished> unpublished(String itemId) {
        return events.of(
                InventoryItemUnpublished.class, event -> event.itemId().toString().equals(itemId));
    }

    @Test
    void itemWritesEmitOneEventPerTransition() {
        String uid = uniqueUid("events-item");
        listed(uid);
        UUID ownerId = testUsers.idOf(uid);
        String id =
                createItem(
                        uid,
                        Map.of(
                                "visibility", "PUBLIC",
                                "availability", "TRADE_OR_SALE",
                                "askingPrice", 120,
                                "notes", "private"));
        assertThat(published(id)).hasSize(1);
        InventoryItemPublished event = published(id).get(0);
        assertThat(event.ownerId()).isEqualTo(ownerId);
        assertThat(event.printingId()).isEqualTo(printingId);
        assertThat(event.gameSlug()).isEqualTo("yugioh");
        assertThat(event.availability()).isEqualTo(Availability.TRADE_OR_SALE);
        assertThat(event.askingPrice()).isEqualByComparingTo("120.00");
        assertThat(event.currency()).isEqualTo("CAD");
        assertThat(event.cardId()).isNotNull();

        // Writes that keep the item public emit nothing.
        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + id,
                uid,
                Map.of("askingPrice", 99),
                200);
        callJson(HttpMethod.POST, "/api/v1/inventory/items/" + id + "/confirm", uid, null, 200);
        assertThat(published(id)).hasSize(1);
        assertThat(unpublished(id)).isEmpty();

        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + id,
                uid,
                Map.of("visibility", "PRIVATE"),
                200);
        assertThat(unpublished(id)).hasSize(1);
        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + id,
                uid,
                Map.of("visibility", "PRIVATE"),
                200);
        assertThat(unpublished(id)).hasSize(1);
        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + id,
                uid,
                Map.of("visibility", "PUBLIC"),
                200);
        assertThat(published(id)).hasSize(2);
        callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + id, uid, null, 204);
        assertThat(unpublished(id)).hasSize(2);

        // A private item never emits anything.
        String privateId = createItem(uid, Map.of());
        callJson(
                HttpMethod.PATCH,
                "/api/v1/inventory/items/" + privateId,
                uid,
                Map.of("quantity", 2),
                200);
        callJson(HttpMethod.DELETE, "/api/v1/inventory/items/" + privateId, uid, null, 204);
        assertThat(published(privateId)).isEmpty();
        assertThat(unpublished(privateId)).isEmpty();
    }

    @Test
    void binderPublicationDrivesItsItems() {
        String uid = uniqueUid("events-binder");
        listed(uid);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                binder("Showcase", "PRIVATE"),
                                201)
                        .path("id")
                        .asString();
        String a = createItem(uid, Map.of("binderId", binderId));
        String b = createItem(uid, Map.of("binderId", binderId));
        String excluded = createItem(uid, Map.of("binderId", binderId, "visibility", "PRIVATE"));
        assertThat(published(a)).isEmpty();

        String uri = "/api/v1/binders/" + binderId;
        callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "PUBLIC"), 200);
        assertThat(published(a)).hasSize(1);
        assertThat(published(b)).hasSize(1);
        assertThat(published(excluded)).isEmpty();
        assertThat(events.of(BinderPublished.class, e -> e.binderId().toString().equals(binderId)))
                .hasSize(1);

        // Switching publication modes keeps everything public: no new events.
        callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "ONE_DAY"), 200);
        callJson(HttpMethod.PATCH, uri, uid, Map.of("name", "Renamed"), 200);
        assertThat(published(a)).hasSize(1);
        assertThat(events.of(BinderPublished.class, e -> e.binderId().toString().equals(binderId)))
                .hasSize(1);

        callJson(HttpMethod.POST, uri + "/unpublish", uid, null, 200);
        assertThat(unpublished(a)).hasSize(1);
        assertThat(unpublished(b)).hasSize(1);
        assertThat(unpublished(excluded)).isEmpty();
        assertThat(
                        events.of(
                                BinderUnpublished.class,
                                e -> e.binderId().toString().equals(binderId)))
                .hasSize(1);

        callJson(HttpMethod.POST, uri + "/publish", uid, Map.of("mode", "PUBLIC"), 200);
        assertThat(published(a)).hasSize(2);
        callJson(HttpMethod.DELETE, uri + "?deleteItems=true", uid, null, 204);
        assertThat(unpublished(a)).hasSize(2);
        assertThat(unpublished(b)).hasSize(2);
        assertThat(
                        events.of(
                                BinderUnpublished.class,
                                e -> e.binderId().toString().equals(binderId)))
                .hasSize(2);
    }

    @Test
    void privacySettingsAndSuspensionsRepublishOrUnpublish() {
        String uid = uniqueUid("events-owner");
        provisionCompliant(uid);
        UUID ownerId = testUsers.idOf(uid);
        String id = createItem(uid, Map.of("visibility", "PUBLIC"));
        assertThat(published(id)).as("owner not listed yet").isEmpty();

        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(published(id)).hasSize(1));

        String admin = uniqueUid("events-admin");
        provisionWithRoles(admin, Role.ADMIN);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + ownerId + "/suspend",
                admin,
                Map.of("reason", "Test suspension"),
                204);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(unpublished(id)).hasSize(1));
        callJson(
                HttpMethod.POST, "/api/v1/admin/users/" + ownerId + "/unsuspend", admin, null, 204);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(published(id)).hasSize(2));

        callJson(
                HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(false, "MEMBERS"), 200);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(unpublished(id)).hasSize(2));
        assertThat(published(id)).hasSize(2);
    }
}
