package com.orenjitrade.api.inventory;

import static com.orenjitrade.api.inventory.InventoryTestSupport.binder;
import static com.orenjitrade.api.inventory.InventoryTestSupport.ids;
import static com.orenjitrade.api.inventory.InventoryTestSupport.item;
import static com.orenjitrade.api.inventory.InventoryTestSupport.printing;
import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The effective public visibility matrix (Phase 3 contract): item visibility and expiry × binder
 * visibility, expiry and freshness × item freshness × owner status × discoverability / profile
 * visibility. Checked through the owner's {@code effectivePublic} flag and the anonymous public
 * lists, which must always agree.
 */
class VisibilityIT extends AbstractIntegrationTest {

    @Autowired private CatalogImportService importService;

    private UUID printingId;

    @BeforeEach
    void catalog() {
        InventoryTestSupport.ensureCatalog(importService);
        printingId = printing(testUsers, "pkm-p013a");
    }

    /** A compliant collector with the given privacy settings; returns the handle. */
    private String collector(String uid, boolean discoverable, String profileVisibility) {
        provisionCompliant(uid);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                uid,
                privacy(discoverable, profileVisibility),
                200);
        return me(uid).path("handle").asString();
    }

    private String createItem(String uid, Map<String, Object> extra) {
        Map<String, Object> body = item(printingId);
        body.putAll(extra);
        return callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                .path("id")
                .asString();
    }

    private String createBinder(String uid, Map<String, Object> body) {
        return callJson(HttpMethod.POST, "/api/v1/binders", uid, body, 201).path("id").asString();
    }

    private boolean effectivePublic(String uid, String itemId) {
        return callJson(HttpMethod.GET, "/api/v1/inventory/items/" + itemId, uid, null, 200)
                .path("effectivePublic")
                .asBoolean();
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

    private void assertPublic(String uid, String handle, String itemId, boolean expected) {
        assertThat(effectivePublic(uid, itemId))
                .as("effectivePublic of %s", itemId)
                .isEqualTo(expected);
        if (expected) {
            assertThat(publicInventory(handle)).contains(itemId);
        } else {
            assertThat(publicInventory(handle)).doesNotContain(itemId);
        }
    }

    @Test
    void itemAndBinderVisibilityExpiryAndFreshness() {
        String uid = uniqueUid("vis-matrix");
        String handle = collector(uid, true, "MEMBERS");
        String future = Instant.now().plus(Duration.ofDays(2)).toString();

        String unfiledPrivate = createItem(uid, Map.of());
        String unfiledPublic = createItem(uid, Map.of("visibility", "PUBLIC"));
        String unfiledTemporary =
                createItem(uid, Map.of("visibility", "TEMPORARILY_PUBLIC", "publicUntil", future));
        String unfiledExpired =
                createItem(uid, Map.of("visibility", "TEMPORARILY_PUBLIC", "publicUntil", future));
        testUsers.update(
                "UPDATE inventory_item SET public_until = now() - interval '1 minute' WHERE id ="
                        + " ?",
                UUID.fromString(unfiledExpired));

        String privateBinder = createBinder(uid, binder("Private", "PRIVATE"));
        String inPrivateBinder = createItem(uid, Map.of("binderId", privateBinder));
        String publicBinder = createBinder(uid, binder("Public", "PUBLIC"));
        String inPublicBinder = createItem(uid, Map.of("binderId", publicBinder));
        String privateInPublicBinder =
                createItem(uid, Map.of("binderId", publicBinder, "visibility", "PRIVATE"));
        String hiddenItem = createItem(uid, Map.of("binderId", publicBinder));
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN' WHERE id = ?",
                UUID.fromString(hiddenItem));
        String staleItem = createItem(uid, Map.of("binderId", publicBinder));
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'STALE' WHERE id = ?",
                UUID.fromString(staleItem));

        Map<String, Object> temporaryBinderBody = binder("Weekend", "TEMPORARILY_PUBLIC");
        temporaryBinderBody.put("publicUntil", future);
        String temporaryBinder = createBinder(uid, temporaryBinderBody);
        String inTemporaryBinder = createItem(uid, Map.of("binderId", temporaryBinder));
        Map<String, Object> expiredBinderBody = binder("Last week", "TEMPORARILY_PUBLIC");
        expiredBinderBody.put("publicUntil", future);
        String expiredBinder = createBinder(uid, expiredBinderBody);
        String inExpiredBinder = createItem(uid, Map.of("binderId", expiredBinder));
        testUsers.update(
                "UPDATE binder SET public_until = now() - interval '1 minute' WHERE id = ?",
                UUID.fromString(expiredBinder));
        String hiddenBinder = createBinder(uid, binder("Forgotten", "PUBLIC"));
        String inHiddenBinder = createItem(uid, Map.of("binderId", hiddenBinder));
        testUsers.update(
                "UPDATE binder SET freshness_state = 'HIDDEN' WHERE id = ?",
                UUID.fromString(hiddenBinder));

        assertPublic(uid, handle, unfiledPrivate, false);
        assertPublic(uid, handle, unfiledPublic, true);
        assertPublic(uid, handle, unfiledTemporary, true);
        assertPublic(uid, handle, unfiledExpired, false);
        assertPublic(uid, handle, inPrivateBinder, false);
        assertPublic(uid, handle, inPublicBinder, true);
        assertPublic(uid, handle, privateInPublicBinder, false);
        assertPublic(uid, handle, hiddenItem, false);
        assertPublic(uid, handle, staleItem, true);
        assertPublic(uid, handle, inTemporaryBinder, true);
        assertPublic(uid, handle, inExpiredBinder, false);
        assertPublic(uid, handle, inHiddenBinder, false);

        // Public binder routes agree with the item rule and hide non-public binders.
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/public/binders/" + publicBinder + "/items",
                                        null,
                                        null,
                                        200)))
                .containsExactlyInAnyOrder(inPublicBinder, staleItem);
        for (String hidden : List.of(privateBinder, expiredBinder, hiddenBinder)) {
            callJson(HttpMethod.GET, "/api/v1/public/binders/" + hidden, null, null, 404);
            callJson(
                    HttpMethod.GET, "/api/v1/public/binders/" + hidden + "/items", null, null, 404);
        }
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + handle + "/binders",
                                        null,
                                        null,
                                        200)))
                .containsExactlyInAnyOrder(publicBinder, temporaryBinder);
    }

    @Test
    void theOwnersDiscoverabilityAndProfileVisibilityGateEverything() {
        String uid = uniqueUid("vis-owner");
        String handle = collector(uid, false, "MEMBERS");
        String item = createItem(uid, Map.of("visibility", "PUBLIC"));

        // Neither discoverable nor a PUBLIC profile: nothing is public (the list is empty).
        assertPublic(uid, handle, item, false);

        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(false, "PUBLIC"), 200);
        assertPublic(uid, handle, item, true);

        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        assertPublic(uid, handle, item, true);

        // A PRIVATE profile hides the collector's listings even when discoverable.
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "PRIVATE"), 200);
        assertThat(effectivePublic(uid, item)).isFalse();
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/inventory", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/binders", null, null, 404);
        // The owner still sees their own (empty) public view.
        assertThat(
                        ids(
                                callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + handle + "/inventory",
                                        uid,
                                        null,
                                        200)))
                .isEmpty();
    }

    @Test
    void suspendedAndDeletionPendingOwnersAreHidden() {
        String uid = uniqueUid("vis-suspended");
        String handle = collector(uid, true, "PUBLIC");
        UUID id = testUsers.idOf(uid);
        String item = createItem(uid, Map.of("visibility", "PUBLIC"));
        String binderId = createBinder(uid, binder("Shown", "PUBLIC"));
        String inBinder = createItem(uid, Map.of("binderId", binderId));
        assertThat(publicInventory(handle)).containsExactlyInAnyOrder(item, inBinder);

        testUsers.setStatus(id, AccountStatus.SUSPENDED, Instant.now().plus(Duration.ofDays(1)));
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/inventory", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/binders", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId + "/items", null, null, 404);

        // A temporary suspension that already ended no longer hides anything.
        testUsers.setStatus(
                id, AccountStatus.SUSPENDED, Instant.now().minus(Duration.ofMinutes(1)));
        assertThat(publicInventory(handle)).containsExactlyInAnyOrder(item, inBinder);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 200);

        testUsers.setStatus(id, AccountStatus.DELETION_REQUESTED, null);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/inventory", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 404);

        testUsers.setStatus(id, AccountStatus.ACTIVE, null);
        assertThat(publicInventory(handle)).containsExactlyInAnyOrder(item, inBinder);
    }

    @Test
    void unknownCollectorsAndBindersAre404() {
        callJson(HttpMethod.GET, "/api/v1/collectors/nobody_here_x/inventory", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/collectors/nobody_here_x/binders", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + UUID.randomUUID(), null, null, 404);
        callJson(
                HttpMethod.GET,
                "/api/v1/public/binders/" + UUID.randomUUID() + "/items",
                null,
                null,
                404);
        JsonNode problem =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/nobody_here_x/inventory?game=chess",
                        null,
                        null,
                        400);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
    }
}
