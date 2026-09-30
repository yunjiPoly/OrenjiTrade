package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.TestDeletionConfiguration;
import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.auth.infra.StaticIdentityTokenVerifier;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.binders.events.BinderUnpublished;
import com.orenjitrade.api.cards.domain.CatalogImportService;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.inventory.events.InventoryItemPublished;
import com.orenjitrade.api.inventory.events.InventoryItemUnpublished;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/** Account deletion: re-authentication, blockers, grace period, cancellation and the job. */
class DeletionIT extends AbstractIntegrationTest {

    static final String SERVICE_TOKEN = "local-service-token";

    @Autowired private NoopIdentityAdminClient identityAdminClient;

    @Autowired private CatalogImportService importService;

    @Autowired private RecordedDomainEvents events;

    private static Map<String, Object> request(String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reason", reason);
        body.put("exportFirst", false);
        return body;
    }

    private JsonNode runJob() {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/jobs/account-deletion")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result);
    }

    @Test
    void aStaleSessionMustReauthenticate() {
        String uid = uniqueUid("del-stale");
        provisionCompliant(uid);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/me/deletion-requests")
                        .header(
                                HttpHeaders.AUTHORIZATION,
                                bearer(uid, StaticIdentityTokenVerifier.FLAG_STALE))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(request(null))
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).isEqualTo(401);
        assertThat(json(result).path("errorCode").asString())
                .isEqualTo("REAUTHENTICATION_REQUIRED");
        assertThat(me(uid).path("status").asString()).isEqualTo("ACTIVE");
    }

    @Test
    void requestHidesTheAccountAndCancelRestoresIt() {
        String uid = uniqueUid("del-cancel");
        UUID id = provisionCompliant(uid);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, discoverable(), 200);
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, area(), 200);
        assertThat(testUsers.locationOf(id).get("public_lat")).isNotNull();

        EntityExchangeResult<byte[]> created =
                call(
                        HttpMethod.POST,
                        "/api/v1/me/deletion-requests",
                        uid,
                        request("Taking a break"));
        assertThat(created.getStatus().value()).isEqualTo(201);
        JsonNode body = json(created);
        String requestId = body.path("id").asString();
        assertThat(created.getResponseHeaders().getLocation())
                .hasPath("/api/v1/me/deletion-requests/" + requestId);
        assertThat(body.path("status").asString()).isEqualTo("PENDING");
        assertThat(body.path("blockers").size()).isZero();
        Instant requestedAt = Instant.parse(body.path("requestedAt").asString());
        Instant scheduledFor = Instant.parse(body.path("scheduledFor").asString());
        assertThat(Duration.between(requestedAt, scheduledFor)).isEqualTo(Duration.ofDays(7));

        // Account state, identity provider and map presence.
        assertThat(me(uid).path("status").asString()).isEqualTo("DELETION_REQUESTED");
        assertThat(identityAdminClient.hasRevokedSessions(uid)).isTrue();
        assertThat(identityAdminClient.isDisabled(uid))
                .as("the owner must be able to sign in again to cancel")
                .isFalse();
        assertThat(testUsers.locationOf(id).get("public_lat")).isNull();
        JsonNode blocked = callJson(HttpMethod.GET, "/api/v1/me/profile", uid, null, 403);
        assertThat(blocked.path("errorCode").asString()).isEqualTo("ACCOUNT_SUSPENDED");
        callJson(HttpMethod.GET, "/api/v1/me/export", uid, null, 200);
        assertThat(testUsers.auditRowsFor(id))
                .anySatisfy(
                        row -> assertThat(row.get("action")).isEqualTo("account.deletion.request"))
                .noneSatisfy(
                        row ->
                                assertThat(String.valueOf(row.get("details")))
                                        .contains("Taking a break"));

        // A second request conflicts; the list shows the pending one.
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/me/deletion-requests",
                                        uid,
                                        request(null),
                                        409)
                                .path("errorCode")
                                .asString())
                .isEqualTo("CONFLICT");
        JsonNode list = callJson(HttpMethod.GET, "/api/v1/me/deletion-requests", uid, null, 200);
        assertThat(list.size()).isEqualTo(1);
        assertThat(list.get(0).path("id").asString()).isEqualTo(requestId);

        // Somebody else cannot cancel it.
        String other = uniqueUid("del-other");
        provisionCompliant(other);
        callJson(HttpMethod.DELETE, "/api/v1/me/deletion-requests/" + requestId, other, null, 404);

        callJson(HttpMethod.DELETE, "/api/v1/me/deletion-requests/" + requestId, uid, null, 204);
        assertThat(me(uid).path("status").asString()).isEqualTo("ACTIVE");
        assertThat(identityAdminClient.isDisabled(uid)).isFalse();
        assertThat(testUsers.locationOf(id).get("public_lat")).isNotNull();
        callJson(HttpMethod.GET, "/api/v1/me/profile", uid, null, 200);
        callJson(HttpMethod.DELETE, "/api/v1/me/deletion-requests/" + requestId, uid, null, 409);
        assertThat(testUsers.auditRowsFor(id))
                .anySatisfy(
                        row -> assertThat(row.get("action")).isEqualTo("account.deletion.cancel"));
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/deletion-requests", uid, null, 200)
                                .get(0)
                                .path("status")
                                .asString())
                .isEqualTo("CANCELLED");
    }

    @Test
    void openObligationsBlockTheDeletion() {
        String uid = uniqueUid("del-blocked");
        UUID id = provisionCompliant(uid);
        TestDeletionConfiguration.BLOCKED.add(id);
        try {
            JsonNode problem =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/me/deletion-requests",
                            uid,
                            request(null),
                            409);
            assertThat(problem.path("errorCode").asString()).isEqualTo("DELETION_BLOCKED");
            assertThat(problem.path("blockers").toString()).isEqualTo("[\"OPEN_DISPUTE\"]");
            assertThat(me(uid).path("status").asString()).isEqualTo("ACTIVE");
            assertThat(
                            callJson(HttpMethod.GET, "/api/v1/me/deletion-requests", uid, null, 200)
                                    .size())
                    .isZero();
        } finally {
            TestDeletionConfiguration.BLOCKED.remove(id);
        }
    }

    @Test
    void theJobAnonymisesAfterTheGracePeriodAndKeepsConsentsAndAudit() throws IOException {
        String uid = uniqueUid("del-job");
        UUID id = provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", handle);
        profile.put("displayName", "Soon Gone");
        profile.put("bio", "bio");
        profile.put("games", List.of("pokemon"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);
        String customLabel = "Gone tag " + Long.toString(System.nanoTime() % 100_000);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                Map.of("customLabels", List.of(customLabel)),
                200);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, discoverable(), 200);
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, area(), 200);
        Map<String, Object> notifications = new LinkedHashMap<>();
        notifications.put("pushEnabled", false);
        notifications.put("emailEnabled", false);
        notifications.put("inAppEnabled", true);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, notifications, 200);
        String avatarPath = URI.create(uploadAvatar(uid)).getPath();
        int consents = testUsers.consentsOf(id).size();

        String requestId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/me/deletion-requests",
                                uid,
                                request("private reason"),
                                201)
                        .path("id")
                        .asString();

        // Not due yet: the job leaves it alone.
        runJob();
        assertThat(testUsers.row(id).get("status")).isEqualTo("DELETION_REQUESTED");

        testUsers.update(
                "UPDATE account_deletion_request SET scheduled_for = now() - interval '1 minute'"
                        + " WHERE id = ?",
                UUID.fromString(requestId));
        JsonNode result = runJob();
        assertThat(result.path("processed").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(result.path("failed").asInt()).isZero();

        Map<String, Object> account = testUsers.row(id);
        assertThat(account.get("status")).isEqualTo("DELETED");
        assertThat(account.get("email")).isEqualTo("deleted+" + id + "@anonymized.invalid");
        assertThat(account.get("display_name")).isEqualTo("Deleted collector");
        assertThat((String) account.get("handle")).startsWith("deleted_").isNotEqualTo(handle);
        assertThat(account.get("deleted_at")).isNotNull();
        assertThat(testUsers.rolesOf(id)).containsExactly("USER");

        assertThat(testUsers.count("SELECT count(*) FROM profile WHERE user_id = ?", id)).isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM profile_tag WHERE profile_user_id = ?", id))
                .isZero();
        assertThat(testUsers.count("SELECT count(*) FROM privacy_settings WHERE user_id = ?", id))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification_preferences WHERE user_id = ?",
                                id))
                .isZero();
        assertThat(testUsers.locationOf(id)).isEmpty();
        assertThat(testUsers.count("SELECT usage_count FROM tag WHERE label = ?", customLabel))
                .isZero();
        http.get().uri(avatarPath).exchange().expectStatus().isNotFound();

        assertThat(testUsers.consentsOf(id)).hasSize(consents);
        assertThat(testUsers.auditRowsFor(id))
                .anySatisfy(
                        row -> assertThat(row.get("action")).isEqualTo("account.deletion.request"))
                .anySatisfy(
                        row -> {
                            assertThat(row.get("action")).isEqualTo("account.deletion.complete");
                            assertThat(row.get("actor_type")).isEqualTo("SYSTEM");
                        });
        List<Map<String, Object>> requests =
                testUsers.query(
                        "SELECT status, reason, completed_at FROM account_deletion_request WHERE id"
                                + " = ?",
                        UUID.fromString(requestId));
        assertThat(requests.get(0).get("status")).isEqualTo("COMPLETED");
        assertThat(requests.get(0).get("reason")).isNull();
        assertThat(requests.get(0).get("completed_at")).isNotNull();
        assertThat(identityAdminClient.isDeleted(uid)).isTrue();
        assertThat(testUsers.jobRuns("account-deletion").get(0).get("status"))
                .isEqualTo("SUCCEEDED");

        // The old handle is gone publicly; a still-valid old token hits the deleted account.
        String viewer = uniqueUid("del-viewer");
        provisionCompliant(viewer);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 404);
        JsonNode deleted = callJson(HttpMethod.GET, "/api/v1/me/profile", uid, null, 403);
        assertThat(deleted.path("errorCode").asString()).isEqualTo("ACCOUNT_SUSPENDED");
        assertThat(testUsers.count("SELECT count(*) FROM user_account WHERE provider_uid = ?", uid))
                .isEqualTo(1);
        assertThat(testUsers.row(id).get("email"))
                .as("a stale token never writes personal data back")
                .isEqualTo("deleted+" + id + "@anonymized.invalid");
        assertThat(testUsers.row(id).get("last_active_at")).isNull();

        // Processing twice is harmless.
        runJob();
        assertThat(testUsers.row(id).get("status")).isEqualTo("DELETED");
    }

    @Test
    void aDeletionRequestHidesPublicInventoryAndThePurgeRemovesIt() throws IOException {
        InventoryTestSupport.ensureCatalog(importService);
        String uid = uniqueUid("del-inventory");
        UUID id = provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, discoverable(), 200);
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                uid,
                                InventoryTestSupport.binder("Leaving soon", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        Map<String, Object> body =
                InventoryTestSupport.item(InventoryTestSupport.printing(testUsers, "mtg-p010a"));
        body.put("binderId", binderId);
        String itemId =
                callJson(HttpMethod.POST, "/api/v1/inventory/items", uid, body, 201)
                        .path("id")
                        .asString();
        String photoUrl = uploadItemPhoto(uid, itemId);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 200);
        assertThat(publishedCount(itemId)).isEqualTo(1);

        String requestId =
                callJson(HttpMethod.POST, "/api/v1/me/deletion-requests", uid, request(null), 201)
                        .path("id")
                        .asString();
        // Hidden at once: public views, public lists and the materialised flags.
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId + "/items", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/inventory", null, null, 404);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + handle + "/binders", null, null, 404);
        assertThat(unpublishedCount(itemId)).isEqualTo(1);
        assertThat(
                        events.of(
                                BinderUnpublished.class,
                                event -> event.binderId().toString().equals(binderId)))
                .hasSize(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ? AND"
                                        + " publicly_listed",
                                UUID.fromString(itemId)))
                .isZero();

        // Cancelling restores the listings.
        callJson(HttpMethod.DELETE, "/api/v1/me/deletion-requests/" + requestId, uid, null, 204);
        callJson(HttpMethod.GET, "/api/v1/public/binders/" + binderId, null, null, 200);
        assertThat(publishedCount(itemId)).isEqualTo(2);

        // The purge deletes items, photos and binders for good.
        String second =
                callJson(HttpMethod.POST, "/api/v1/me/deletion-requests", uid, request(null), 201)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE account_deletion_request SET scheduled_for = now() - interval '1 minute'"
                        + " WHERE id = ?",
                UUID.fromString(second));
        assertThat(runJob().path("failed").asInt()).isZero();
        assertThat(testUsers.count("SELECT count(*) FROM inventory_item WHERE owner_id = ?", id))
                .isZero();
        assertThat(testUsers.count("SELECT count(*) FROM binder WHERE owner_id = ?", id)).isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item_image WHERE item_id = ?",
                                UUID.fromString(itemId)))
                .isZero();
        http.get().uri(URI.create(photoUrl).getPath()).exchange().expectStatus().isNotFound();
        assertThat(unpublishedCount(itemId)).isEqualTo(2);
    }

    private long publishedCount(String itemId) {
        return events.of(
                        InventoryItemPublished.class,
                        event -> event.itemId().toString().equals(itemId))
                .size();
    }

    private long unpublishedCount(String itemId) {
        return events.of(
                        InventoryItemUnpublished.class,
                        event -> event.itemId().toString().equals(itemId))
                .size();
    }

    private String uploadItemPhoto(String uid, String itemId) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(InventoryTestSupport.png(80, 60)) {
                            @Override
                            public String getFilename() {
                                return "card.png";
                            }
                        })
                .contentType(MediaType.IMAGE_PNG);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/inventory/items/" + itemId + "/images")
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectStatus()
                        .isCreated()
                        .expectBody()
                        .returnResult();
        return json(result).path("images").get(0).path("url").asString();
    }

    @Test
    void endpointsNeedTheRightCredentials() {
        callJson(HttpMethod.POST, "/api/v1/me/deletion-requests", null, request(null), 401);
        callJson(HttpMethod.GET, "/api/v1/me/deletion-requests", null, null, 401);
        callJson(
                HttpMethod.DELETE,
                "/api/v1/me/deletion-requests/" + UUID.randomUUID(),
                null,
                null,
                401);
        http.post()
                .uri("/internal/jobs/account-deletion")
                .exchange()
                .expectStatus()
                .isUnauthorized();
        String uid = uniqueUid("del-user-on-internal");
        provisionCompliant(uid);
        http.post()
                .uri("/internal/jobs/account-deletion")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .exchange()
                .expectStatus()
                .isUnauthorized();
        Map<String, Object> tooLong = request("x".repeat(1001));
        callJson(HttpMethod.POST, "/api/v1/me/deletion-requests", uid, tooLong, 400);
    }

    private String uploadAvatar(String uid) throws IOException {
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB), "png", png);
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part(
                        "file",
                        new ByteArrayResource(png.toByteArray()) {
                            @Override
                            public String getFilename() {
                                return "a.png";
                            }
                        })
                .contentType(MediaType.IMAGE_PNG);
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/me/profile/avatar")
                        .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                        .contentType(MediaType.MULTIPART_FORM_DATA)
                        .body(builder.build())
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result).path("avatarUrl").asString();
    }

    static Map<String, Object> discoverable() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", true);
        body.put("showDistance", true);
        body.put("showOnlineStatus", false);
        body.put("showLastActive", true);
        body.put("profileVisibility", "MEMBERS");
        body.put("messagingPermission", "MEMBERS_WITH_PROFILE");
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }

    static Map<String, Object> area() {
        return Map.of("lat", 45.5071, "lng", -73.5541, "radiusKm", 5);
    }
}
