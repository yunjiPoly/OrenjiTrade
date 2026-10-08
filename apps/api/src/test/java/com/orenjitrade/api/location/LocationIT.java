package com.orenjitrade.api.location;

import static com.orenjitrade.api.inventory.InventoryTestSupport.privacy;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code /me/location} (ADR 0017): country, state/province and optional city, validated against the
 * seeded lists (400 Problem Details for unknown codes); discoverability needs them (409
 * LOCATION_REQUIRED) and goes with them; no coordinate is accepted, stored or returned.
 */
class LocationIT extends AbstractIntegrationTest {

    static Map<String, Object> location(
            @Nullable Object country, @Nullable Object subdivision, @Nullable Object city) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("countryCode", country);
        body.put("subdivisionCode", subdivision);
        body.put("city", city);
        return body;
    }

    @Test
    void theOwnerSetsReadsAndRemovesTheirLocation() {
        String uid = uniqueUid("loc-owner");
        UUID id = provisionCompliantWithoutLocation(uid);

        JsonNode empty = callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200);
        assertThat(empty.path("location").isNull()).isTrue();
        assertThat(empty.path("discoverable").asBoolean()).isFalse();
        assertThat(me(uid).path("onboarding").path("locationSet").asBoolean()).isFalse();

        Map<String, Object> body = location("ca", " ca-qc ", "  Saint-Jean-sur-Richelieu  ");
        body.put("showCity", false);
        body.put("lat", 45.30712); // ignored: no coordinate is ever accepted
        body.put("lng", -73.26281);
        JsonNode set = callJson(HttpMethod.PUT, "/api/v1/me/location", uid, body, 200);
        JsonNode location = set.path("location");
        assertThat(location.path("regionCode").asString()).isEqualTo("americas-north");
        assertThat(location.path("regionName").asString()).isEqualTo("Americas (North)");
        assertThat(location.path("countryCode").asString()).isEqualTo("CA");
        assertThat(location.path("countryName").asString()).isEqualTo("Canada");
        assertThat(location.path("subdivisionCode").asString()).isEqualTo("CA-QC");
        assertThat(location.path("subdivisionName").asString()).isEqualTo("Quebec");
        assertThat(location.path("label").asString()).isEqualTo("Quebec, Canada");
        assertThat(location.path("city").asString()).isEqualTo("Saint-Jean-sur-Richelieu");
        assertThat(location.path("showCity").asBoolean()).isFalse();
        assertThat(set.toString()).doesNotContain("45.3").doesNotContain("73.2");
        assertThat(testUsers.locationOf(id))
                .containsEntry("country_code", "CA")
                .containsEntry("subdivision_code", "CA-QC")
                .containsEntry("city", "Saint-Jean-sur-Richelieu")
                .containsEntry("show_city", false);
        assertThat(me(uid).path("onboarding").path("locationSet").asBoolean()).isTrue();

        // A whole-country pseudo-subdivision; a blank city clears it; showCity defaults to true.
        JsonNode territory =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/location",
                        uid,
                        location("PR", "PR", "   "),
                        200);
        assertThat(territory.path("location").path("label").asString()).isEqualTo("Puerto Rico");
        assertThat(territory.path("location").path("city").isNull()).isTrue();
        assertThat(territory.path("location").path("showCity").asBoolean()).isTrue();

        // Europe.
        JsonNode europe =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/location",
                        uid,
                        location("FR", "FR-IDF", "Paris"),
                        200);
        assertThat(europe.path("location").path("regionCode").asString()).isEqualTo("europe");

        callJson(HttpMethod.DELETE, "/api/v1/me/location", uid, null, 204);
        callJson(HttpMethod.DELETE, "/api/v1/me/location", uid, null, 204);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200)
                                .path("location")
                                .isNull())
                .isTrue();
        assertThat(testUsers.locationOf(id)).isEmpty();
    }

    @Test
    void unknownCodesAndInvalidCitiesAreProblemDetails() {
        String uid = uniqueUid("loc-invalid");
        provisionCompliantWithoutLocation(uid);
        assertProblem(uid, location("ZZ", "ZZ-01", null), "countryCode");
        assertProblem(uid, location("RU", "RU-MOW", null), "countryCode"); // not in a region
        assertProblem(uid, location("CA", "US-NY", null), "subdivisionCode");
        assertProblem(uid, location("CA", "CA-XX", null), "subdivisionCode");
        assertProblem(uid, location("CA", "", null), "subdivisionCode");
        assertProblem(uid, location(null, "CA-QC", null), "countryCode");
        assertProblem(uid, location("CA", "CA-QC", "x".repeat(81)), "city");
        assertProblem(uid, location("CA", "CA-QC", "45.50884, -73.58781"), "city");
        assertProblem(uid, location("CA", "CA-QC", "<script>"), "city");
        assertProblem(uid, location("CA", "CA-QC", "Zorblax Falls"), "city"); // banned term
        // 80 characters after trimming and spaces collapsed are fine.
        JsonNode ok =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/location",
                        uid,
                        location("CA", "CA-QC", "  " + "a".repeat(80) + "  "),
                        200);
        assertThat(ok.path("location").path("city").asString()).hasSize(80);
        JsonNode punctuation =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/location",
                        uid,
                        location("CA", "CA-NL", "St.  John's"),
                        200);
        assertThat(punctuation.path("location").path("city").asString()).isEqualTo("St. John's");
        // The old trading-area endpoint is gone.
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                uid,
                Map.of("lat", 45.5, "lng", -73.6, "radiusKm", 5),
                404);
        callJson(HttpMethod.GET, "/api/v1/me/location", null, null, 401);
    }

    private void assertProblem(String uid, Map<String, Object> body, String field) {
        JsonNode problem = callJson(HttpMethod.PUT, "/api/v1/me/location", uid, body, 400);
        assertThat(problem.path("errorCode").asString()).isEqualTo("VALIDATION_FAILED");
        assertThat(problem.path("requestId").asString()).isNotBlank();
        assertThat(problem.toString()).as(body.toString()).contains("\"" + field + "\"");
    }

    @Test
    void discoverabilityNeedsACountryAndAStateAndGoesWithThem() {
        String uid = uniqueUid("loc-disc");
        provisionCompliantWithoutLocation(uid);
        JsonNode refused =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/settings/privacy",
                        uid,
                        privacy(true, "MEMBERS"),
                        409);
        assertThat(refused.path("errorCode").asString()).isEqualTo("LOCATION_REQUIRED");
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", uid, null, 200)
                                .path("discoverable")
                                .asBoolean())
                .isFalse();

        setLocation(uid, "MX", "MX-CMX", null);
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(true, "MEMBERS"), 200);
        JsonNode mine = callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200);
        assertThat(mine.path("discoverable").asBoolean()).isTrue();
        assertThat(mine.path("location").path("label").asString()).isEqualTo("Mexico City, Mexico");
        // The privacy settings carry no distance switch any more.
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", uid, null, 200)
                                .has("showDistance"))
                .isFalse();

        callJson(HttpMethod.DELETE, "/api/v1/me/location", uid, null, 204);
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", uid, null, 200)
                                .path("discoverable")
                                .asBoolean())
                .as("removing the location turns discoverability off")
                .isFalse();
    }

    @Test
    void theExportCarriesTheOwnersCityAndCodes() {
        String uid = uniqueUid("loc-export");
        provisionCompliantWithoutLocation(uid);
        setLocation(uid, "AR", "AR-C", "Palermo");
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", uid, null, 200);
        JsonNode section = export.path("sections").path("location");
        assertThat(section.path("countryCode").asString()).isEqualTo("AR");
        assertThat(section.path("subdivisionCode").asString()).isEqualTo("AR-C");
        assertThat(section.path("city").asString()).isEqualTo("Palermo");
        assertThat(section.path("showCity").asBoolean()).isTrue();
        assertThat(export.toString()).doesNotContain("tradingArea").doesNotContain("publicPoint");
    }
}
