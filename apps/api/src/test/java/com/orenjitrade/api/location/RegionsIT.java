package com.orenjitrade.api.location;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * {@code GET /api/v1/regions} and {@code /api/v1/admin/regions} (ADR 0017): the seeded platform
 * regions, their countries and subdivisions, and the audited country-to-region mapping.
 */
class RegionsIT extends AbstractIntegrationTest {

    private static List<String> codes(JsonNode array) {
        List<String> codes = new ArrayList<>();
        array.forEach(node -> codes.add(node.path("code").asString()));
        return codes;
    }

    private static JsonNode region(JsonNode regions, String code) {
        for (JsonNode region : regions.path("regions")) {
            if (code.equals(region.path("code").asString())) {
                return region;
            }
        }
        throw new AssertionError(code + " not in " + regions);
    }

    private static JsonNode country(JsonNode region, String code) {
        for (JsonNode country : region.path("countries")) {
            if (code.equals(country.path("code").asString())) {
                return country;
            }
        }
        throw new AssertionError(code + " not in " + region.path("code"));
    }

    @Test
    void theThreeRegionsWithTheirCountriesAndSubdivisionsArePublic() {
        JsonNode regions = callJson(HttpMethod.GET, "/api/v1/regions", null, null, 200);
        assertThat(codes(regions.path("regions")))
                .containsExactly("americas-north", "americas-south", "europe");
        JsonNode north = region(regions, "americas-north");
        assertThat(north.path("name").asString()).isEqualTo("Americas (North)");
        assertThat(north.path("isDefault").asBoolean()).isTrue();
        assertThat(region(regions, "europe").path("isDefault").asBoolean()).isFalse();
        assertThat(codes(north.path("countries")))
                .startsWith("CA", "US", "MX")
                .contains("PR", "CR");
        JsonNode canada = country(north, "CA");
        assertThat(canada.path("name").asString()).isEqualTo("Canada");
        assertThat(codes(canada.path("subdivisions"))).hasSize(13).contains("CA-QC", "CA-NU");
        assertThat(country(north, "US").path("subdivisions").size())
                .as("50 states and DC")
                .isEqualTo(51);
        JsonNode puertoRico = country(north, "PR").path("subdivisions");
        assertThat(puertoRico.size()).isEqualTo(1);
        assertThat(puertoRico.get(0).path("code").asString()).isEqualTo("PR");
        assertThat(puertoRico.get(0).path("wholeCountry").asBoolean()).isTrue();

        JsonNode south = region(regions, "americas-south");
        assertThat(codes(south.path("countries"))).contains("BR", "AR", "CL", "GF", "FK");
        assertThat(codes(country(south, "BR").path("subdivisions"))).hasSize(27);

        JsonNode europe = region(regions, "europe");
        assertThat(codes(europe.path("countries")))
                .contains("FR", "DE", "GB", "ES", "IT", "UA", "XK")
                .doesNotContain("RU", "TR");
        assertThat(codes(country(europe, "FR").path("subdivisions")))
                .hasSize(13)
                .contains("FR-IDF", "FR-20R");
        assertThat(codes(country(europe, "GB").path("subdivisions")))
                .containsExactlyInAnyOrder("GB-ENG", "GB-NIR", "GB-SCT", "GB-WLS");
        assertThat(regions.toString()).doesNotContain("\"lat").doesNotContain("\"lng");
    }

    @Test
    void adminsMoveCountriesBetweenRegionsAndDeactivateThem() {
        String admin = uniqueUid("regions-admin");
        provisionWithRoles(admin, Role.ADMIN);
        String collector = uniqueUid("regions-collector");
        provisionCompliant(collector);
        try {
            JsonNode moved =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/admin/regions/countries/bm",
                            admin,
                            Map.of("regionCode", "europe", "active", true),
                            200);
            assertThat(moved.path("code").asString()).isEqualTo("BM");
            assertThat(moved.path("regionCode").asString()).isEqualTo("europe");
            JsonNode regions = callJson(HttpMethod.GET, "/api/v1/regions", null, null, 200);
            assertThat(codes(region(regions, "europe").path("countries"))).contains("BM");
            assertThat(codes(region(regions, "americas-north").path("countries")))
                    .doesNotContain("BM");
            assertThat(
                            testUsers.count(
                                    "SELECT count(*) FROM audit_log WHERE action ="
                                            + " 'region.country.update' AND target_id = 'BM'"))
                    .isPositive();

            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/regions/countries/BM",
                    admin,
                    Map.of("regionCode", "americas-north", "active", false),
                    200);
            assertThat(
                            codes(
                                    region(
                                                    callJson(
                                                            HttpMethod.GET,
                                                            "/api/v1/regions",
                                                            null,
                                                            null,
                                                            200),
                                                    "americas-north")
                                            .path("countries")))
                    .as("inactive countries are not offered")
                    .doesNotContain("BM");
            JsonNode adminView =
                    callJson(HttpMethod.GET, "/api/v1/admin/regions", admin, null, 200);
            assertThat(
                            country(region(adminView, "americas-north"), "BM")
                                    .path("active")
                                    .asBoolean())
                    .isFalse();
            JsonNode refused =
                    callJson(
                            HttpMethod.PUT,
                            "/api/v1/me/location",
                            collector,
                            Map.of("countryCode", "BM", "subdivisionCode", "BM"),
                            400);
            assertThat(refused.toString()).contains("countryCode");

            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/regions/countries/BM",
                    admin,
                    Map.of("regionCode", "asia", "active", true),
                    400);
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/regions/countries/ZZ",
                    admin,
                    Map.of("regionCode", "europe", "active", true),
                    404);
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/regions/countries/BM",
                    collector,
                    Map.of("regionCode", "europe", "active", true),
                    403);
            callJson(HttpMethod.GET, "/api/v1/admin/regions", collector, null, 403);
            callJson(HttpMethod.GET, "/api/v1/admin/regions", null, null, 401);
        } finally {
            callJson(
                    HttpMethod.PUT,
                    "/api/v1/admin/regions/countries/BM",
                    admin,
                    Map.of("regionCode", "americas-north", "active", true),
                    200);
        }
    }
}
