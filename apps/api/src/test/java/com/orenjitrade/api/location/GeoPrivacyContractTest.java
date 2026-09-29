package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import tools.jackson.databind.JsonNode;

/**
 * ADR 0004 contract test over the seeded collectors: every coordinate in a public or admin response
 * has at most 3 decimals and is the stored public point; trading-area centres and home points never
 * appear; nothing coordinate-like reaches the logs. Shares the seeded context with {@code
 * SeedDataRunnerIT}.
 */
@TestPropertySource(properties = "orenji.seed.enabled=true")
@ExtendWith(OutputCaptureExtension.class)
class GeoPrivacyContractTest extends AbstractIntegrationTest {

    static final List<String> DISCOVERABLE =
            List.of(
                    "collector1",
                    "collector2",
                    "collector3",
                    "collector4",
                    "collector5",
                    "collector6",
                    "collector8",
                    "premium_user");

    static final List<String> NOT_DISCOVERABLE =
            List.of("collector7", "moderator", "admin", "superadmin");

    /** A longitude of the Montréal area with 3+ decimals, e.g. {@code -73.581}. */
    static final Pattern LONGITUDE_IN_LOGS = Pattern.compile("-7\\d\\.\\d{3,}");

    /** Seed admin token uid with its real email (so the login does not rewrite the seed email). */
    static final String SEED_ADMIN = "seed-admin:admin@orenjitrade.test";

    private UUID idOf(String handle) {
        return (UUID)
                testUsers
                        .query("SELECT id FROM user_account WHERE handle = ?", handle)
                        .get(0)
                        .get("id");
    }

    @Test
    void publicAndAdminResponsesOnlyEverCarryPublicPoints(CapturedOutput output) {
        String viewer = uniqueUid("geo-viewer");
        UUID viewerId = provisionCompliant(viewer);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/location/trading-area",
                viewer,
                Map.of("lat", 45.51739, "lng", -73.58914, "radiusKm", 10),
                200);

        for (String handle : DISCOVERABLE) {
            UUID id = idOf(handle);
            Map<String, Object> stored = testUsers.locationOf(id);
            assertThat(stored).as("seeded location of %s", handle).isNotEmpty();
            double publicLat = ((Number) stored.get("public_lat")).doubleValue();
            double publicLng = ((Number) stored.get("public_lng")).doubleValue();

            JsonNode profile =
                    callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 200);
            assertOnlyPublicPrecision(profile, handle);
            List<double[]> points = coordinatePairs(profile);
            assertThat(points).as("%s exposes exactly its stored public point", handle).hasSize(1);
            assertThat(points.get(0)[0]).isEqualTo(publicLat);
            assertThat(points.get(0)[1]).isEqualTo(publicLng);
            assertThat(profile.path("location").path("publicLabel").asString())
                    .isEqualTo(stored.get("public_label"));
            assertThat(profile.path("location").path("distanceBucket").asString()).isNotBlank();
            assertNoPrivateLocationKeys(profile, handle);
        }

        for (String handle : NOT_DISCOVERABLE) {
            JsonNode profile =
                    callJson(HttpMethod.GET, "/api/v1/collectors/" + handle, viewer, null, 200);
            assertThat(profile.path("location").isNull()).as(handle).isTrue();
            assertThat(coordinatePairs(profile)).isEmpty();
            assertThat(testUsers.locationOf(idOf(handle)).get("public_lat"))
                    .as("ADR 0004: no public point while not discoverable")
                    .isNull();
        }

        List<String> everyone = new ArrayList<>(DISCOVERABLE);
        everyone.addAll(NOT_DISCOVERABLE);
        for (String handle : everyone) {
            UUID id = idOf(handle);
            JsonNode detail =
                    callJson(HttpMethod.GET, "/api/v1/admin/users/" + id, SEED_ADMIN, null, 200);
            assertOnlyPublicPrecision(detail, handle);
            assertThat(coordinatePairs(detail)).as("admin detail of %s", handle).isEmpty();
            assertNoPrivateLocationKeys(detail, handle);
            assertThat(detail.path("locationLabel").asString())
                    .isEqualTo(testUsers.locationOf(id).get("public_label"));
        }

        // The viewer's own public profile never shows their centre either.
        JsonNode self =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + me(viewer).path("handle").asString(),
                        viewer,
                        null,
                        200);
        assertThat(self.toString()).doesNotContain("45.51739").doesNotContain("45.517,");
        assertThat(testUsers.locationOf(viewerId)).isNotEmpty();

        String logs = output.getAll();
        assertThat(logs).doesNotContain("45.51739").doesNotContain("-73.58914");
        assertThat(LONGITUDE_IN_LOGS.matcher(logs).find())
                .as("no coordinates in the logs")
                .isFalse();
    }

    private static void assertNoPrivateLocationKeys(JsonNode node, String handle) {
        String text = node.toString();
        assertThat(text)
                .as("private location keys in the response for %s", handle)
                .doesNotContain("tradingArea")
                .doesNotContain("radiusKm")
                .doesNotContain("homePoint")
                .doesNotContain("home_point")
                .doesNotContain("trading_area");
    }

    /** Every number in the document (not only lat/lng) has at most 3 decimals. */
    private static void assertOnlyPublicPrecision(JsonNode node, String context) {
        if (node.isNumber()) {
            assertThat(decimals(node.decimalValue()))
                    .as("numeric value %s in %s", node, context)
                    .isLessThanOrEqualTo(3);
            return;
        }
        for (JsonNode child : node) {
            assertOnlyPublicPrecision(child, context);
        }
    }

    /** Every object carrying numeric {@code lat} and {@code lng} members. */
    static List<double[]> coordinatePairs(JsonNode node) {
        List<double[]> pairs = new ArrayList<>();
        collect(node, pairs);
        return pairs;
    }

    private static void collect(JsonNode node, List<double[]> pairs) {
        if (node.isObject() && node.path("lat").isNumber() && node.path("lng").isNumber()) {
            pairs.add(new double[] {node.path("lat").asDouble(), node.path("lng").asDouble()});
        }
        for (JsonNode child : node) {
            collect(child, pairs);
        }
    }

    private static int decimals(BigDecimal value) {
        return Math.max(0, value.stripTrailingZeros().scale());
    }
}
