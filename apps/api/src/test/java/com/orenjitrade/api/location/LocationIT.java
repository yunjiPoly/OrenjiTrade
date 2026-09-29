package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.location.domain.ApproximateLocationService;
import com.orenjitrade.api.location.domain.GridCell;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/** {@code /me/location} (ADR 0004): owner view, derivation rules, discoverability gate. */
class LocationIT extends AbstractIntegrationTest {

    static Map<String, Object> area(Object lat, Object lng, Object radiusKm) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("lat", lat);
        body.put("lng", lng);
        body.put("radiusKm", radiusKm);
        return body;
    }

    static Map<String, Object> privacy(boolean discoverable) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("discoverable", discoverable);
        body.put("showDistance", true);
        body.put("showOnlineStatus", false);
        body.put("showLastActive", true);
        body.put("profileVisibility", "MEMBERS");
        body.put("messagingPermission", "MEMBERS_WITH_PROFILE");
        body.put("wishlistVisible", false);
        body.put("searchDiscoverable", true);
        return body;
    }

    private void setDiscoverable(String uid, boolean discoverable) {
        callJson(HttpMethod.PUT, "/api/v1/me/settings/privacy", uid, privacy(discoverable), 200);
    }

    @Test
    void ownerSeesTheCentreAndThePublicPointOnlyExistsWhileDiscoverable() {
        String uid = uniqueUid("loc-owner");
        UUID id = provisionCompliant(uid);

        JsonNode empty = callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200);
        assertThat(empty.path("tradingArea").isNull()).isTrue();
        assertThat(empty.path("publicPoint").isNull()).isTrue();
        assertThat(empty.path("discoverable").asBoolean()).isFalse();
        assertThat(me(uid).path("onboarding").path("tradingAreaSet").asBoolean()).isFalse();

        JsonNode set =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/location/trading-area",
                        uid,
                        area(45.52345, -73.58123, 5),
                        200);
        assertThat(set.path("tradingArea").path("lat").asDouble()).isEqualTo(45.523);
        assertThat(set.path("tradingArea").path("lng").asDouble()).isEqualTo(-73.581);
        assertThat(set.path("tradingArea").path("radiusKm").asInt()).isEqualTo(5);
        assertThat(set.path("tradingArea").path("source").asString()).isEqualTo("MANUAL");
        assertThat(set.path("tradingArea").path("label").asString()).isNotBlank();
        assertThat(set.path("publicPoint").isNull()).as("not discoverable by default").isTrue();
        assertThat(testUsers.locationOf(id).get("public_lat")).isNull();
        assertThat(testUsers.locationOf(id).get("grid_cell")).isNull();
        assertThat(me(uid).path("onboarding").path("tradingAreaSet").asBoolean()).isTrue();

        setDiscoverable(uid, true);
        JsonNode visible = callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200);
        assertThat(visible.path("discoverable").asBoolean()).isTrue();
        double lat = visible.path("publicPoint").path("lat").asDouble();
        double lng = visible.path("publicPoint").path("lng").asDouble();
        assertThat(decimals(lat)).isLessThanOrEqualTo(3);
        assertThat(decimals(lng)).isLessThanOrEqualTo(3);
        Map<String, Object> stored = testUsers.locationOf(id);
        assertThat(((Number) stored.get("public_lat")).doubleValue()).isEqualTo(lat);
        assertThat(((Number) stored.get("public_lng")).doubleValue()).isEqualTo(lng);
        GridCell cell = ApproximateLocationService.cellOf(45.523, -73.581);
        assertThat(stored.get("grid_cell")).isEqualTo(cell.id());
        assertThat(cell.contains(lat, lng)).isTrue();

        setDiscoverable(uid, false);
        assertThat(testUsers.locationOf(id).get("public_lat")).isNull();
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200)
                                .path("publicPoint")
                                .isNull())
                .isTrue();
    }

    @Test
    void derivationIsDeterministicPerUserAndCell() {
        String uid = uniqueUid("loc-determinism");
        provisionCompliant(uid);
        setDiscoverable(uid, true);

        JsonNode first = put(uid, 45.5001, -73.6001, 5);
        JsonNode again = put(uid, 45.5001, -73.6001, 10);
        GridCell cell = ApproximateLocationService.cellOf(45.5, -73.6);
        double insideLat = cell.south() + 0.004;
        double insideLng = cell.west() + 0.005;
        JsonNode sameCell = put(uid, insideLat, insideLng, 5);
        assertThat(again.path("publicPoint")).isEqualTo(first.path("publicPoint"));
        assertThat(sameCell.path("publicPoint")).isEqualTo(first.path("publicPoint"));

        callJson(HttpMethod.DELETE, "/api/v1/me/location", uid, null, 204);
        assertThat(put(uid, 45.5001, -73.6001, 5).path("publicPoint"))
                .isEqualTo(first.path("publicPoint"));

        // Another cell gives another point, still inside its own cell.
        JsonNode elsewhere = put(uid, 45.4580, -73.5680, 5);
        GridCell verdun = ApproximateLocationService.cellOf(45.458, -73.568);
        assertThat(
                        verdun.contains(
                                elsewhere.path("publicPoint").path("lat").asDouble(),
                                elsewhere.path("publicPoint").path("lng").asDouble()))
                .isTrue();
        assertThat(elsewhere.path("publicPoint")).isNotEqualTo(first.path("publicPoint"));
    }

    @Test
    void differentUsersInTheSameCellGetDifferentPoints() {
        Set<String> points = new HashSet<>();
        for (int i = 0; i < 5; i++) {
            String uid = uniqueUid("loc-many");
            provisionCompliant(uid);
            setDiscoverable(uid, true);
            points.add(put(uid, 45.5071, -73.5541, 3).path("publicPoint").toString());
        }
        assertThat(points.size()).isGreaterThanOrEqualTo(2);
    }

    @Test
    void theCentreIsOwnerOnly() {
        String owner = uniqueUid("loc-private-owner");
        provisionCompliant(owner);
        setDiscoverable(owner, true);
        put(owner, 45.53117, -73.59229, 7);
        String handle = me(owner).path("handle").asString();

        String viewer = uniqueUid("loc-private-viewer");
        provisionCompliant(viewer);
        JsonNode collector =
                callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 200);
        String text = collector.toString();
        assertThat(text).doesNotContain("tradingArea").doesNotContain("radiusKm");
        assertThat(text).doesNotContain("45.53117").doesNotContain("-73.59229");
        assertThat(collector.path("location").path("publicPoint").isObject()).isTrue();
    }

    @Test
    void validationAndAuthentication() {
        String uid = uniqueUid("loc-validation");
        provisionCompliant(uid);
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, area(91, -73.5, 5), 400);
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, area(86, -73.5, 5), 400);
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, area(45.5, -181, 5), 400);
        callJson(
                HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, area(45.5, -73.5, 0), 400);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                uid,
                area(45.5, -73.5, 51),
                400);
        Map<String, Object> noLng = new LinkedHashMap<>(area(45.5, -73.5, 5));
        noLng.remove("lng");
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, noLng, 400);
        Map<String, Object> badSource = new LinkedHashMap<>(area(45.5, -73.5, 5));
        badSource.put("source", "GPS");
        callJson(HttpMethod.PUT, "/api/v1/me/location/trading-area", uid, badSource, 400);
        Map<String, Object> device = new LinkedHashMap<>(area(45.5, -73.5, 5));
        device.put("source", "DEVICE");
        assertThat(
                        callJson(
                                        HttpMethod.PUT,
                                        "/api/v1/me/location/trading-area",
                                        uid,
                                        device,
                                        200)
                                .path("tradingArea")
                                .path("source")
                                .asString())
                .isEqualTo("DEVICE");

        callJson(HttpMethod.GET, "/api/v1/me/location", null, null, 401);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                null,
                area(45.5, -73.5, 5),
                401);
        callJson(HttpMethod.DELETE, "/api/v1/me/location", null, null, 401);
    }

    @Test
    void deleteRemovesEverything() {
        String uid = uniqueUid("loc-delete");
        UUID id = provisionCompliant(uid);
        setDiscoverable(uid, true);
        put(uid, 45.5, -73.6, 5);
        callJson(HttpMethod.DELETE, "/api/v1/me/location", uid, null, 204);
        assertThat(testUsers.locationOf(id)).isEmpty();
        JsonNode after = callJson(HttpMethod.GET, "/api/v1/me/location", uid, null, 200);
        assertThat(after.path("tradingArea").isNull()).isTrue();
        assertThat(after.path("discoverable").asBoolean()).isTrue();
        assertThat(me(uid).path("onboarding").path("tradingAreaSet").asBoolean()).isFalse();
        // Deleting twice is fine.
        callJson(HttpMethod.DELETE, "/api/v1/me/location", uid, null, 204);
    }

    private JsonNode put(String uid, double lat, double lng, int radiusKm) {
        return callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                uid,
                area(lat, lng, radiusKm),
                200);
    }

    static int decimals(double value) {
        return Math.max(0, BigDecimal.valueOf(value).stripTrailingZeros().scale());
    }
}
