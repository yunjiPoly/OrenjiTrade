package com.orenjitrade.api.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.inventory.InventoryTestSupport;
import com.orenjitrade.api.offers.AbstractOffersIT;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/**
 * The 18+ rule (launch readiness, V103): the confirmation is recorded server-side like any other
 * consent, {@code GET /me} reports it, and the service layer refuses discoverability, messaging,
 * community posts and offers with {@code 403 AGE_CONFIRMATION_REQUIRED} until it exists. Admin and
 * staff paths are not gated.
 */
class AgeConfirmationIT extends AbstractOffersIT {

    private static final String AGE_VERSION = "2026-10-05";
    private static final Map<String, Object> AGE_CONSENT =
            Map.of("documentType", "AGE_CONFIRMATION", "version", AGE_VERSION);

    @Test
    void theConfirmationIsRecordedWithTimestampHashedIpUserAgentAndAudit() {
        String uid = uniqueUid("age-signup");
        UUID id = provision(uid);

        assertThat(me(uid).path("onboarding").path("ageConfirmed").asBoolean()).isFalse();

        http.post()
                .uri("/api/v1/me/consents")
                .header(HttpHeaders.AUTHORIZATION, bearer(uid))
                .header(HttpHeaders.USER_AGENT, "AgeConfirmationIT/1.0")
                .contentType(MediaType.APPLICATION_JSON)
                .body(AGE_CONSENT)
                .exchange()
                .expectStatus()
                .isNoContent();

        List<Map<String, Object>> rows =
                testUsers.query(
                        "SELECT document_type, version, accepted_at, ip_hash, user_agent FROM"
                                + " user_consent WHERE user_id = ? AND document_type ="
                                + " 'AGE_CONFIRMATION'",
                        id);
        assertThat(rows).hasSize(1);
        Map<String, Object> row = rows.get(0);
        assertThat(row.get("version")).isEqualTo(AGE_VERSION);
        assertThat(row.get("accepted_at")).as("server-side timestamp").isNotNull();
        assertThat(String.valueOf(row.get("ip_hash"))).matches("^[0-9a-f]{64}$");
        assertThat(row.get("user_agent")).isEqualTo("AgeConfirmationIT/1.0");
        assertThat(testUsers.auditRowsFor(id))
                .extracting(audit -> audit.get("details").toString())
                .anySatisfy(details -> assertThat(details).contains("AGE_CONFIRMATION"));

        assertThat(me(uid).path("onboarding").path("ageConfirmed").asBoolean()).isTrue();

        // A stale version is refused like for any other document; the attestation is not lost.
        callJson(
                HttpMethod.POST,
                "/api/v1/me/consents",
                uid,
                Map.of("documentType", "AGE_CONFIRMATION", "version", "1999-01-01"),
                409);
        assertThat(me(uid).path("onboarding").path("ageConfirmed").asBoolean()).isTrue();
    }

    @Test
    void theAttestationIsNeverRequiredAtRegistration() {
        String uid = uniqueUid("age-terms");
        UUID id = provision(uid);
        testUsers.acceptAllRequiredConsents(id);

        JsonNode me = me(uid);
        assertThat(me.path("requiredConsents")).isEmpty();
        assertThat(me.path("onboarding").path("ageConfirmed").asBoolean()).isFalse();

        // Not a 428: every other route still answers (reading is never gated).
        callJson(HttpMethod.GET, "/api/v1/conversations", uid, null, 200);
        callJson(HttpMethod.GET, "/api/v1/me/settings/privacy", uid, null, 200);
    }

    @Test
    void unconfirmedAccountsCannotBecomeDiscoverableMessagePostOrOffer() {
        Collector seller = member("age-seller");
        String itemId = listing(seller, "SALE", 1);

        String uid = uniqueUid("age-unconfirmed");
        UUID id = provisionWithoutAgeConfirmation(uid);
        String handle = me(uid).path("handle").asString();
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", handle);
        profile.put("displayName", "Collector " + handle);
        profile.put("bio", "");
        profile.put("games", List.of("yugioh"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);

        // Discoverability on the map.
        JsonNode problem =
                callJson(
                        HttpMethod.PUT,
                        "/api/v1/me/settings/privacy",
                        uid,
                        InventoryTestSupport.privacy(true, "MEMBERS"),
                        403);
        assertAgeProblem(problem);
        assertThat(testUsers.locationOf(id)).as("no public point was derived").isEmpty();
        // Other privacy switches keep working while the collector stays hidden.
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                uid,
                InventoryTestSupport.privacy(false, "MEMBERS"),
                200);

        // Messaging: starting a conversation and writing in an existing one.
        assertAgeProblem(
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        uid,
                        Map.of("recipientId", seller.id().toString()),
                        403));
        String conversationId =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/conversations",
                                seller.uid(),
                                Map.of("recipientId", id.toString()),
                                201)
                        .path("id")
                        .asString();
        assertAgeProblem(
                callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + conversationId + "/messages",
                        uid,
                        Map.of("kind", "TEXT", "body", "Hello"),
                        403));
        callJson(
                HttpMethod.GET,
                "/api/v1/conversations/" + conversationId + "/messages",
                uid,
                null,
                200);

        // Community posting.
        assertAgeProblem(
                callJson(
                        HttpMethod.POST,
                        "/api/v1/community/channels/general/posts",
                        uid,
                        Map.of("body", "Anyone trading near the Plateau?"),
                        403));

        // Offers.
        assertAgeProblem(
                callJson(HttpMethod.POST, "/api/v1/offers", uid, cash(itemId, "30.00"), 403));

        // Confirming once (through the onboarding flow) unlocks everything.
        callJson(HttpMethod.POST, "/api/v1/me/consents", uid, AGE_CONSENT, 204);
        assertThat(me(uid).path("onboarding").path("ageConfirmed").asBoolean()).isTrue();
        callJson(
                HttpMethod.PUT,
                "/api/v1/me/settings/privacy",
                uid,
                InventoryTestSupport.privacy(true, "MEMBERS"),
                200);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                uid,
                Map.of("kind", "TEXT", "body", "Hello"),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/community/channels/general/posts",
                uid,
                Map.of("body", "Anyone trading near the Plateau?"),
                201);
        String offerId =
                callJson(HttpMethod.POST, "/api/v1/offers", uid, cash(itemId, "30.00"), 201)
                        .path("id")
                        .asString();

        // Countering is gated too: simulate a missing attestation on the seller's side.
        testUsers.update(
                "DELETE FROM user_consent WHERE user_id = ? AND document_type = 'AGE_CONFIRMATION'",
                seller.id());
        Map<String, Object> counter = counterCash("35.00");
        counter.put("version", 0);
        assertAgeProblem(act(seller, offerId, "counter", counter, 403));
        testUsers.confirmAge(seller.id());
        act(seller, offerId, "counter", counter, 200);
    }

    @Test
    void adminAndStaffPathsAreNotGated() {
        String admin = uniqueUid("age-admin");
        UUID adminId = provisionWithoutAgeConfirmation(admin);
        testUsers.grantRoles(adminId, Role.ADMIN);
        String moderator = uniqueUid("age-moderator");
        UUID moderatorId = provisionWithoutAgeConfirmation(moderator);
        testUsers.grantRoles(moderatorId, Role.MODERATOR);

        callJson(HttpMethod.GET, "/api/v1/admin/users?size=5", admin, null, 200);
        callJson(HttpMethod.GET, "/api/v1/admin/feature-flags", admin, null, 200);
        callJson(HttpMethod.GET, "/api/v1/admin/reports?size=5", moderator, null, 200);
        assertThat(me(admin).path("onboarding").path("ageConfirmed").asBoolean())
                .as("staff accounts are reported like everyone else; only the gate skips them")
                .isFalse();
    }

    private static void assertAgeProblem(JsonNode problem) {
        assertThat(problem.path("status").asInt()).isEqualTo(403);
        assertThat(problem.path("errorCode").asString()).isEqualTo("AGE_CONFIRMATION_REQUIRED");
        assertThat(problem.path("title").asString()).isEqualTo("Age confirmation required");
        assertThat(problem.path("message").asString()).contains("18 years of age or older");
        assertThat(problem.path("requestId").asString()).isNotBlank();
        assertThat(problem.path("timestamp").asString()).isNotBlank();
        JsonNode consent = problem.path("requiredConsents").path(0);
        assertThat(consent.path("documentType").asString()).isEqualTo("AGE_CONFIRMATION");
        assertThat(consent.path("version").asString()).isEqualTo(AGE_VERSION);
    }
}
