package com.orenjitrade.api.delisting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.delisting.domain.DelistPolicyService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 7 auto-delisting admin: the policy edit with ordering validation, the stale/hidden review
 * list, the audited admin restore and hide, the admin binder unpublish, and pausing / resuming a
 * collector's public listings (audited, never deleting anything; moderators are refused).
 */
class DelistingAdminIT extends AbstractPhase7IT {

    @Autowired private DelistPolicyService policies;

    @Test
    void policyEditsAreValidatedAndAudited() {
        String admin = staff("dl-policy-admin", Role.ADMIN);
        JsonNode list = callJson(HttpMethod.GET, "/api/v1/admin/delist-policies", admin, null, 200);
        JsonNode active = list.get(0);
        String id = active.path("id").asString();
        assertThat(active.path("unansweredAfterHours").asInt()).isEqualTo(72);

        Map<String, Object> wrongOrder = policy(20, 15, 46, 5);
        JsonNode refused =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/admin/delist-policies/" + id,
                        admin,
                        wrongOrder,
                        400);
        assertThat(refused.path("errors").toString()).contains("staleAfterDays");
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/delist-policies/" + id,
                admin,
                policy(15, 31, 31, 5),
                400);
        Map<String, Object> badWindow = policy(15, 31, 46, 5);
        badWindow.put("unansweredAfterHours", 0);
        callJson(HttpMethod.PUT, "/api/v1/admin/delist-policies/" + id, admin, badWindow, 400);

        Map<String, Object> change = policy(15, 31, 46, 5);
        change.put("unansweredAfterHours", 96);
        try {
            JsonNode updated =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/admin/delist-policies/" + id,
                            admin,
                            change,
                            200);
            assertThat(updated.path("unansweredAfterHours").asInt()).isEqualTo(96);
            assertThat(policies.active().unansweredAfterHours()).isEqualTo(96);
            assertThat(auditRows("DELIST_POLICY", id).getLast().get("details").toString())
                    .contains("unansweredAfterHours");
        } finally {
            Map<String, Object> restore = policy(15, 31, 46, 5);
            restore.put("maxStrikes", 3);
            restore.put("unansweredAfterHours", 72);
            callJson(HttpMethod.PUT, "/api/v1/admin/delist-policies/" + id, admin, restore, 200);
        }
        String moderator = staff("dl-policy-mod", Role.MODERATOR);
        callJson(HttpMethod.GET, "/api/v1/admin/delist-policies", moderator, null, 403);
    }

    @Test
    void staleListingsAreReviewedRestoredAndHidden() {
        Collector owner = member("dl-stale-owner");
        Collector viewer = member("dl-stale-viewer");
        String admin = staff("dl-stale-admin", Role.ADMIN);
        String itemId = publicItem(owner, printing(AZURE), Map.of("notes", "Private stale note"));
        testUsers.update(
                "UPDATE inventory_item SET freshness_state = 'HIDDEN', confirmed_at = now() -"
                        + " interval '400 days', warned_at = now() - interval '6 days' WHERE id ="
                        + " ?::uuid",
                itemId);
        assertThat(publiclyListed(owner, itemId, viewer)).isFalse();

        JsonNode stale =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/listings/stale?state=HIDDEN&size=100",
                        admin,
                        null,
                        200);
        JsonNode mine = find(stale, itemId);
        assertThat(mine).as("the hidden listing is in the review list").isNotNull();
        assertThat(mine.path("state").asString()).isEqualTo("HIDDEN");
        assertThat(mine.path("owner").path("handle").asString()).isEqualTo(owner.handle());
        assertThat(mine.path("warnedAt").asString()).isNotBlank();
        assertThat(mine.path("confirmedAt").asString()).isNotBlank();
        assertThat(stale.toString()).doesNotContain("Private stale note");
        callJson(HttpMethod.GET, "/api/v1/admin/listings/stale?state=ACTIVE", admin, null, 400);

        JsonNode restored =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/listings/" + itemId + "/restore",
                        admin,
                        null,
                        200);
        assertThat(restored.path("state").asString()).isEqualTo("ACTIVE");
        assertThat(restored.path("item").path("effectivePublic").asBoolean()).isTrue();
        assertThat(publiclyListed(owner, itemId, viewer)).isTrue();
        assertThat(auditActions("INVENTORY_ITEM", itemId)).contains("listing.restore");
        assertThat(auditRows("INVENTORY_ITEM", itemId).getFirst().get("details").toString())
                .contains("HIDDEN");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/listings/" + java.util.UUID.randomUUID() + "/restore",
                admin,
                null,
                404);

        JsonNode listings =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/listings?ownerId=" + owner.id(),
                        admin,
                        null,
                        200);
        assertThat(listings.path("totalItems").asLong()).isEqualTo(1);
        JsonNode hidden =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/listings/" + itemId + "/hide",
                        admin,
                        Map.of("reason", "Counterfeit photo"),
                        200);
        assertThat(hidden.path("item").path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(publiclyListed(owner, itemId, viewer)).isFalse();
        assertThat(auditActions("INVENTORY_ITEM", itemId)).contains("listing.hide");

        // Binders: admin unpublish, audited.
        String binderId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/binders",
                                owner.uid(),
                                Map.of("name", "Trade binder", "visibility", "PUBLIC"),
                                201)
                        .path("id")
                        .asString();
        JsonNode binders =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/binders?ownerId=" + owner.id(),
                        admin,
                        null,
                        200);
        assertThat(binders.path("items").get(0).path("ownerHandle").asString())
                .isEqualTo(owner.handle());
        JsonNode unpublished =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/binders/" + binderId + "/unpublish",
                        admin,
                        Map.of("reason", "Misleading name"),
                        200);
        assertThat(unpublished.path("visibility").asString()).isEqualTo("PRIVATE");
        assertThat(auditActions("BINDER", binderId)).containsExactly("binder.unpublish");
    }

    @Test
    void adminsPauseAndResumeListings() {
        Collector owner = member("dl-pause-owner");
        Collector viewer = member("dl-pause-viewer");
        String admin = staff("dl-pause-admin", Role.ADMIN);
        String moderator = staff("dl-pause-mod", Role.MODERATOR);
        String itemId = publicItem(owner, printing(AZURE), Map.of());
        assertThat(publiclyListed(owner, itemId, viewer)).isTrue();

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + owner.id() + "/pause-listings",
                moderator,
                Map.of("reason", "x"),
                403);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + owner.id() + "/pause-listings",
                admin,
                Map.of("reason", " "),
                400);
        JsonNode paused =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/users/" + owner.id() + "/pause-listings",
                        admin,
                        Map.of("reason", "Repeated no-shows at meetups"),
                        200);
        assertThat(paused.path("paused").asBoolean()).isTrue();
        assertThat(paused.path("source").asString()).isEqualTo("ADMIN");
        assertThat(paused.path("reason").asString()).isEqualTo("Repeated no-shows at meetups");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + owner.id() + "/pause-listings",
                admin,
                Map.of("reason", "again"),
                409);
        assertThat(publiclyListed(owner, itemId, viewer)).isFalse();
        await().atMost(WAIT)
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM inventory_item WHERE id ="
                                                        + " ?::uuid AND publicly_listed",
                                                itemId)
                                        == 0);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ?::uuid AND"
                                        + " deleted_at IS NULL",
                                itemId))
                .as("nothing is deleted")
                .isEqualTo(1);
        JsonNode ownerView =
                callJson(HttpMethod.GET, "/api/v1/me/listings/status", owner.uid(), null, 200);
        assertThat(ownerView.path("paused").asBoolean()).isTrue();
        assertThat(ownerView.path("reason").isNull()).isTrue();
        callJson(HttpMethod.POST, "/api/v1/me/listings/resume", owner.uid(), null, 409);

        JsonNode resumed =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/users/" + owner.id() + "/resume-listings",
                        admin,
                        Map.of("note", "Explained on the phone"),
                        200);
        assertThat(resumed.path("paused").asBoolean()).isFalse();
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + owner.id() + "/resume-listings",
                admin,
                null,
                409);
        assertThat(publiclyListed(owner, itemId, viewer)).isTrue();
        assertThat(auditActions("USER", owner.id().toString()))
                .containsSubsequence("listings.pause", "listings.resume");

        // A timed pause ends by itself (the delist job clears it).
        Map<String, Object> timed = new LinkedHashMap<>();
        timed.put("reason", "Cooling off");
        timed.put("until", java.time.Instant.now().plusSeconds(3600).toString());
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + owner.id() + "/pause-listings",
                admin,
                timed,
                200);
        assertThat(publiclyListed(owner, itemId, viewer)).isFalse();
        testUsers.update(
                "UPDATE user_responsiveness SET paused_until = now() - interval '1 minute' WHERE"
                        + " user_id = ?",
                owner.id());
        assertThat(publiclyListed(owner, itemId, viewer))
                .as("an ended pause no longer hides")
                .isTrue();
        assertThat(runDelistJob().path("pausesExpired").asInt()).isGreaterThanOrEqualTo(1);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM user_responsiveness WHERE user_id = ? AND"
                                        + " paused_at IS NOT NULL",
                                owner.id()))
                .isZero();
    }

    private static Map<String, Object> policy(int aging, int stale, int hidden, int warn) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("agingAfterDays", aging);
        body.put("staleAfterDays", stale);
        body.put("hiddenAfterDays", hidden);
        body.put("warnBeforeHiddenDays", warn);
        return body;
    }

    private static JsonNode find(JsonNode page, String itemId) {
        for (JsonNode entry : page.path("items")) {
            if (itemId.equals(entry.path("item").path("id").asString())) {
                return entry;
            }
        }
        return null;
    }
}
