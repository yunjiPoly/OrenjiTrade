package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/** {@code GET /me/export}: one section per module, attachment, owner only. */
class ExportIT extends AbstractIntegrationTest {

    @Test
    void exportContainsEverySectionOfTheOwner() {
        String uid = uniqueUid("export");
        UUID id = provisionCompliant(uid);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", handle);
        profile.put("displayName", "Export Person");
        profile.put("bio", "Exported bio");
        profile.put("games", List.of("riftbound"));
        profile.put("languages", List.of("fr"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/profile/tags",
                uid,
                Map.of("customLabels", List.of("Trader")),
                200);
        setLocation(uid, "CA", "CA-ON", "Ottawa");

        EntityExchangeResult<byte[]> result = call(HttpMethod.GET, "/api/v1/me/export", uid, null);
        assertThat(result.getStatus().value()).isEqualTo(200);
        assertThat(result.getResponseHeaders().getFirst(HttpHeaders.CONTENT_DISPOSITION))
                .startsWith("attachment")
                .contains("orenjitrade-export-" + handle);
        assertThat(result.getResponseHeaders().getCacheControl()).isEqualTo("no-store");
        JsonNode export = json(result);
        String text = export.toString();

        assertThat(export.path("formatVersion").asString()).isEqualTo("1");
        assertThat(export.path("userId").asString()).isEqualTo(id.toString());
        assertThat(export.path("exportedAt").asString()).isNotBlank();
        JsonNode sections = export.path("sections");
        assertThat(sections.path("account").path("email").asString())
                .isEqualTo(uid.toLowerCase() + "@orenjitrade.test");
        // 4 required documents + the 18+ confirmation (V103), both Law 25 evidence.
        assertThat(sections.path("account").path("consents").size()).isEqualTo(5);
        assertThat(sections.path("profile").path("displayName").asString())
                .isEqualTo("Export Person");
        assertThat(sections.path("profile").path("tags").get(0).path("slug").asString())
                .isEqualTo("trader");
        assertThat(sections.path("privacySettings").path("discoverable").asBoolean()).isFalse();
        assertThat(sections.path("notificationPreferences").path("categories").has("MARKETING"))
                .isTrue();
        JsonNode location = sections.path("location");
        assertThat(location.path("countryCode").asString()).isEqualTo("CA");
        assertThat(location.path("subdivisionCode").asString()).isEqualTo("CA-ON");
        assertThat(location.path("city").asString()).isEqualTo("Ottawa");

        assertThat(text)
                .doesNotContain("providerUid")
                .doesNotContain("provider_uid")
                .doesNotContain("homePoint")
                .doesNotContain("home_point")
                .doesNotContain("tradingArea")
                .doesNotContain("publicPoint");
    }

    @Test
    void exportWithoutModuleDataAndAnonymousAccess() {
        String uid = uniqueUid("export-empty");
        provisionCompliantWithoutLocation(uid);
        JsonNode export = callJson(HttpMethod.GET, "/api/v1/me/export", uid, null, 200);
        assertThat(export.path("sections").path("account").path("handle").asString()).isNotBlank();
        assertThat(
                        export.path("sections").path("location").isMissingNode()
                                || export.path("sections").path("location").isNull())
                .isTrue();
        callJson(HttpMethod.GET, "/api/v1/me/export", null, null, 401);
    }
}
