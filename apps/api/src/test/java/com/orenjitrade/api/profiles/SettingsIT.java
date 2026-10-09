package com.orenjitrade.api.profiles;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/** {@code GET|PUT /me/settings/privacy} and {@code /me/settings/notifications}. */
class SettingsIT extends AbstractIntegrationTest {

    static final List<String> CATEGORIES =
            List.of(
                    "MESSAGE",
                    "OFFER",
                    "RATING",
                    "TRADE",
                    "BINDER_FRESHNESS",
                    "REPORT_DECISION",
                    "MARKETING");

    @Test
    void privacyDefaultsFavourSafetyAndPutReplacesEverything() {
        String uid = uniqueUid("privacy");
        provisionCompliant(uid);

        JsonNode defaults = callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", uid, null, 200);
        assertThat(defaults.path("discoverable").asBoolean()).isFalse();
        assertThat(defaults.path("showOnlineStatus").asBoolean()).isFalse();
        assertThat(defaults.path("showLastActive").asBoolean()).isTrue();
        assertThat(defaults.path("profileVisibility").asString()).isEqualTo("MEMBERS");
        assertThat(defaults.path("messagingPermission").asString())
                .isEqualTo("MEMBERS_WITH_PROFILE");
        assertThat(defaults.path("wishlistVisible").asBoolean()).isFalse();
        assertThat(defaults.path("searchDiscoverable").asBoolean()).isTrue();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", true);
        body.put("showOnlineStatus", true);
        body.put("showLastActive", false);
        body.put("profileVisibility", "PUBLIC");
        body.put("messagingPermission", "NOBODY");
        body.put("wishlistVisible", true);
        body.put("searchDiscoverable", false);
        JsonNode saved = callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, body, 200);
        assertThat(saved.toString()).isEqualTo(jsonMapper.valueToTree(body).toString());
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", uid, null, 200)
                                .toString())
                .isEqualTo(saved.toString());

        Map<String, Object> missing = new LinkedHashMap<>(body);
        missing.remove("wishlistVisible");
        JsonNode problem =
                callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, missing, 400);
        assertThat(problem.path("errors").toString()).contains("wishlistVisible");

        Map<String, Object> badEnum = new LinkedHashMap<>(body);
        badEnum.put("profileVisibility", "FRIENDS");
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, badEnum, 400);

        callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", null, null, 401);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", null, body, 401);
    }

    @Test
    void notificationDefaultsAndReplacement() {
        String uid = uniqueUid("notifications");
        provisionCompliant(uid);

        JsonNode defaults =
                callJson(HttpMethod.GET, "/api/v1/me/settings/notifications", uid, null, 200);
        assertThat(defaults.path("pushEnabled").asBoolean()).isTrue();
        assertThat(defaults.path("emailEnabled").asBoolean()).isFalse();
        assertThat(defaults.path("inAppEnabled").asBoolean()).isTrue();
        assertThat(defaults.path("wishlistAlerts").asBoolean()).as("on by default").isTrue();
        List<String> names = defaults.path("categories").propertyNames().stream().toList();
        assertThat(names).containsExactlyElementsOf(CATEGORIES);
        assertThat(defaults.path("categories").path("MESSAGE").toString())
                .isEqualTo("{\"push\":true,\"email\":false,\"inApp\":true}");
        assertThat(defaults.path("categories").path("MARKETING").toString())
                .isEqualTo("{\"push\":false,\"email\":false,\"inApp\":false}");
        assertThat(defaults.path("quietHours").toString())
                .isEqualTo(
                        "{\"enabled\":false,\"start\":\"22:00\",\"end\":\"08:00\",\"timezone\":\"America/Toronto\"}");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("pushEnabled", false);
        body.put("emailEnabled", true);
        body.put("inAppEnabled", true);
        body.put("wishlistAlerts", false);
        body.put(
                "categories",
                Map.of(
                        "MESSAGE", Map.of("push", false, "email", true, "inApp", true),
                        "MARKETING", Map.of("push", false, "email", true, "inApp", false)));
        body.put(
                "quietHours",
                Map.of(
                        "enabled",
                        true,
                        "start",
                        "23:30",
                        "end",
                        "07:00",
                        "timezone",
                        "Europe/Paris"));
        JsonNode saved =
                callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, body, 200);
        assertThat(saved.path("pushEnabled").asBoolean()).isFalse();
        assertThat(saved.path("emailEnabled").asBoolean()).isTrue();
        assertThat(saved.path("wishlistAlerts").asBoolean()).isFalse();
        assertThat(saved.path("categories").has("WISHLIST_MATCH"))
                .as("wishlist alerts have their own switch, not a category")
                .isFalse();
        assertThat(saved.path("categories").path("MESSAGE").toString())
                .isEqualTo("{\"push\":false,\"email\":true,\"inApp\":true}");
        assertThat(saved.path("categories").path("MARKETING").path("email").asBoolean()).isTrue();
        assertThat(saved.path("categories").path("OFFER").toString())
                .as("categories left out keep their defaults")
                .isEqualTo("{\"push\":true,\"email\":false,\"inApp\":true}");
        assertThat(saved.path("quietHours").path("timezone").asString()).isEqualTo("Europe/Paris");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/me/settings/notifications",
                                        uid,
                                        null,
                                        200)
                                .toString())
                .isEqualTo(saved.toString());

        // Left out: wishlist alerts default to on (full replacement).
        Map<String, Object> withoutSwitch = new LinkedHashMap<>(body);
        withoutSwitch.remove("wishlistAlerts");
        assertThat(
                        callJson(
                                        HttpMethod.PUT,
                                        "/api/v1/me/settings/notifications",
                                        uid,
                                        withoutSwitch,
                                        200)
                                .path("wishlistAlerts")
                                .asBoolean())
                .isTrue();

        // The removed WISHLIST_MATCH category is unknown now.
        Map<String, Object> oldCategory = new LinkedHashMap<>(body);
        oldCategory.put(
                "categories",
                Map.of("WISHLIST_MATCH", Map.of("push", true, "email", true, "inApp", true)));
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, oldCategory, 400);

        Map<String, Object> unknownCategory = new LinkedHashMap<>(body);
        unknownCategory.put(
                "categories", Map.of("NOPE", Map.of("push", true, "email", true, "inApp", true)));
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, unknownCategory, 400);

        Map<String, Object> badTime = new LinkedHashMap<>(body);
        badTime.put(
                "quietHours",
                Map.of("enabled", true, "start", "25:00", "end", "07:00", "timezone", "UTC"));
        JsonNode timeProblem =
                callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, badTime, 400);
        assertThat(timeProblem.path("errors").toString()).contains("quietHours.start");

        Map<String, Object> badZone = new LinkedHashMap<>(body);
        badZone.put(
                "quietHours",
                Map.of(
                        "enabled",
                        true,
                        "start",
                        "22:00",
                        "end",
                        "07:00",
                        "timezone",
                        "Mars/Olympus"));
        JsonNode zoneProblem =
                callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, badZone, 400);
        assertThat(zoneProblem.path("errors").toString()).contains("quietHours.timezone");

        Map<String, Object> missingPush = new LinkedHashMap<>(body);
        missingPush.remove("pushEnabled");
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, missingPush, 400);

        Map<String, Object> partialChannels = new LinkedHashMap<>(body);
        partialChannels.put("categories", Map.of("MESSAGE", Map.of("push", true)));
        callJson(HttpMethod.PUT, "/api/v1/me/settings/notifications", uid, partialChannels, 400);

        callJson(HttpMethod.GET, "/api/v1/me/settings/notifications", null, null, 401);
    }
}
