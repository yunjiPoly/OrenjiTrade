package com.orenjitrade.api.profiles;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.AccountStatus;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/** {@code GET /collectors/{handle}}: visibility matrix and privacy-dependent fields. */
class CollectorProfileIT extends AbstractIntegrationTest {

    static Map<String, Object> privacy(
            boolean discoverable,
            boolean showDistance,
            boolean showOnlineStatus,
            boolean showLastActive,
            String visibility,
            String messaging) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", discoverable);
        body.put("showDistance", showDistance);
        body.put("showOnlineStatus", showOnlineStatus);
        body.put("showLastActive", showLastActive);
        body.put("profileVisibility", visibility);
        body.put("messagingPermission", messaging);
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }

    private record Collector(String uid, UUID id, String handle) {}

    private Collector collector(String prefix) {
        String uid = uniqueUid(prefix);
        UUID id = provisionCompliant(uid);
        return new Collector(uid, id, me(uid).path("handle").asString());
    }

    private void saveProfile(Collector collector) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", collector.handle());
        body.put("displayName", "Collector " + collector.handle());
        body.put("bio", "Public bio");
        body.put("games", List.of("mtg"));
        body.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", collector.uid(), body, 200);
    }

    private void setPrivacy(Collector collector, Map<String, Object> privacy) {
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", collector.uid(), privacy, 200);
    }

    private void setArea(Collector collector, double lat, double lng) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("lat", lat);
        body.put("lng", lng);
        body.put("radiusKm", 5);
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", collector.uid(), body, 200);
    }

    private JsonNode view(Collector viewer, String handle, int status) {
        return callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer.uid(), null, status);
    }

    @Test
    void defaultsShowAMembersProfileWithoutLocationOrPresence() {
        Collector target = collector("coll-target");
        saveProfile(target);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                target.uid(),
                Map.of("customLabels", List.of("Trader")),
                200);
        Collector viewer = collector("coll-viewer");

        JsonNode profile = view(viewer, target.handle(), 200);
        assertThat(profile.path("id").asString()).isEqualTo(target.id().toString());
        assertThat(profile.path("handle").asString()).isEqualTo(target.handle());
        assertThat(profile.path("displayName").asString())
                .isEqualTo("Collector " + target.handle());
        assertThat(profile.path("bio").asString()).isEqualTo("Public bio");
        assertThat(profile.path("games").toString()).isEqualTo("[\"mtg\"]");
        assertThat(profile.path("tags").toString())
                .isEqualTo("[{\"slug\":\"trader\",\"label\":\"Trader\"}]");
        assertThat(profile.has("location")).isTrue();
        assertThat(profile.path("location").isNull()).isTrue();
        assertThat(profile.path("avatarUrl").isNull()).isTrue();
        assertThat(profile.path("memberSince").asString())
                .isEqualTo(LocalDate.now(ZoneOffset.UTC).toString());
        assertThat(profile.path("lastActiveBucket").asString()).isEqualTo("TODAY");
        assertThat(profile.path("onlineStatus").asString()).isEqualTo("HIDDEN");
        assertThat(profile.path("rating").path("average").isNull()).isTrue();
        assertThat(profile.path("rating").path("count").asInt()).isZero();
        assertThat(profile.path("publicBinderCount").asInt()).isZero();
        assertThat(profile.path("isBlocked").asBoolean()).isFalse();
        assertThat(profile.path("canMessage").asBoolean())
                .as("MEMBERS_WITH_PROFILE and the viewer has no profile yet")
                .isFalse();

        saveProfile(viewer);
        assertThat(view(viewer, target.handle(), 200).path("canMessage").asBoolean()).isTrue();
        // Case-insensitive handle lookup.
        assertThat(view(viewer, target.handle().toUpperCase(), 200).path("id").asString())
                .isEqualTo(target.id().toString());
        // Nobody messages themselves.
        assertThat(view(target, target.handle(), 200).path("canMessage").asBoolean()).isFalse();
    }

    @Test
    void privateProfilesExistOnlyForTheirOwner() {
        Collector target = collector("coll-private");
        setPrivacy(target, privacy(true, true, false, true, "PRIVATE", "EVERYONE"));
        Collector viewer = collector("coll-private-viewer");

        JsonNode notFound = view(viewer, target.handle(), 404);
        assertThat(notFound.path("errorCode").asString()).isEqualTo("NOT_FOUND");
        assertThat(view(target, target.handle(), 200).path("handle").asString())
                .isEqualTo(target.handle());

        setPrivacy(target, privacy(true, true, false, true, "PUBLIC", "EVERYONE"));
        view(viewer, target.handle(), 200);
    }

    @Test
    void locationAndDistanceFollowDiscoverabilityAndShowDistance() {
        Collector target = collector("coll-geo");
        setArea(target, 45.522, -73.581);
        Collector viewer = collector("coll-geo-viewer");

        assertThat(view(viewer, target.handle(), 200).path("location").isNull()).isTrue();

        setPrivacy(target, privacy(true, true, false, true, "MEMBERS", "MEMBERS_WITH_PROFILE"));
        JsonNode location = view(viewer, target.handle(), 200).path("location");
        Map<String, Object> stored = testUsers.locationOf(target.id());
        assertThat(location.path("publicPoint").path("lat").asDouble())
                .isEqualTo(((Number) stored.get("public_lat")).doubleValue());
        assertThat(location.path("publicPoint").path("lng").asDouble())
                .isEqualTo(((Number) stored.get("public_lng")).doubleValue());
        assertThat(location.path("publicLabel").asString()).isEqualTo(stored.get("public_label"));
        assertThat(location.has("distanceBucket")).isTrue();
        assertThat(location.path("distanceBucket").isNull())
                .as("the viewer has no trading area")
                .isTrue();

        setArea(viewer, 45.458, -73.568); // Verdun, ~7 km away
        assertThat(
                        view(viewer, target.handle(), 200)
                                .path("location")
                                .path("distanceBucket")
                                .asString())
                .isEqualTo("KM_5_10");

        setPrivacy(target, privacy(true, false, false, true, "MEMBERS", "MEMBERS_WITH_PROFILE"));
        assertThat(
                        view(viewer, target.handle(), 200)
                                .path("location")
                                .path("distanceBucket")
                                .isNull())
                .isTrue();

        setPrivacy(target, privacy(false, true, false, true, "MEMBERS", "MEMBERS_WITH_PROFILE"));
        assertThat(view(viewer, target.handle(), 200).path("location").isNull()).isTrue();
    }

    @Test
    void presenceLastActiveAndMessagingSwitches() {
        Collector target = collector("coll-switches");
        Collector viewer = collector("coll-switches-viewer");

        setPrivacy(target, privacy(false, true, true, false, "MEMBERS", "NOBODY"));
        JsonNode hidden = view(viewer, target.handle(), 200);
        assertThat(hidden.path("lastActiveBucket").asString()).isEqualTo("HIDDEN");
        assertThat(hidden.path("onlineStatus").asString()).isEqualTo("OFFLINE");
        assertThat(hidden.path("canMessage").asBoolean()).isFalse();
        // The owner always sees their own activity.
        assertThat(view(target, target.handle(), 200).path("lastActiveBucket").asString())
                .isNotEqualTo("HIDDEN");

        setPrivacy(target, privacy(false, true, false, true, "MEMBERS", "EVERYONE"));
        testUsers.setLastActive(target.id(), Instant.now().minus(Duration.ofDays(3)));
        JsonNode shown = view(viewer, target.handle(), 200);
        assertThat(shown.path("lastActiveBucket").asString()).isEqualTo("THIS_WEEK");
        assertThat(shown.path("onlineStatus").asString()).isEqualTo("HIDDEN");
        assertThat(shown.path("canMessage").asBoolean())
                .as("EVERYONE, even without profile")
                .isTrue();
    }

    @Test
    void hiddenAccountsAndUnknownHandlesAre404AndAnonymousIs401() {
        Collector viewer = collector("coll-hidden-viewer");
        Collector suspended = collector("coll-suspended");
        testUsers.setStatus(suspended.id(), AccountStatus.SUSPENDED, null);
        view(viewer, suspended.handle(), 404);

        Collector pending = collector("coll-pending");
        testUsers.setStatus(pending.id(), AccountStatus.DELETION_REQUESTED, null);
        view(viewer, pending.handle(), 404);

        Collector expired = collector("coll-expired");
        testUsers.setStatus(expired.id(), AccountStatus.SUSPENDED, Instant.now().minusSeconds(60));
        view(viewer, expired.handle(), 200);

        view(viewer, "no_such_collector_x", 404);
        callJson(HttpMethod.GET, "/api/v1/collectors/" + viewer.handle(), null, null, 401);
    }
}
