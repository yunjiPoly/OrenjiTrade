package com.orenjitrade.api.donations;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.AbstractPhase10IT;
import com.orenjitrade.api.donations.infra.FakeDonationProvider;
import com.orenjitrade.api.donations.infra.FakeDonationProvider.SignedWebhook;
import java.util.LinkedHashMap;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 donations with the fake provider: checkout, the fake checkout page and its signed
 * synthetic webhook, the opt-in supporters list (display names only), failures, idempotent and
 * signed webhooks, validation against the settings, admin views and refunds, and no effect on
 * ratings or interactions ("voluntary support").
 */
class DonationIT extends AbstractPhase10IT {

    static final String WEBHOOK = "/api/v1/webhooks/donations/fake";

    @Autowired private FakeDonationProvider fakeProvider;

    @BeforeEach
    void enable() {
        flag("donations", true);
    }

    @Test
    void aDonationSucceedsWithTheFakeProviderAndOptedInDonorsAreThanked() {
        Member donor = member("donor");
        String displayName = "Fictional Donor " + donor.uid().substring(donor.uid().length() - 6);
        profile(donor, displayName);
        JsonNode checkout = checkout(donor, "10.00", "CAD", "Thanks for the app!", true, 201);
        JsonNode donation = checkout.path("donation");
        assertThat(donation.path("status").asString()).isEqualTo("PENDING");
        assertThat(donation.path("label").asString()).isEqualTo("Voluntary support");
        String url = checkout.path("url").asString();
        assertThat(url).startsWith(FakeDonationProvider.CHECKOUT_PATH);
        String ref = url.substring(FakeDonationProvider.CHECKOUT_PATH.length());

        Member stranger = member("donor-stranger");
        callJson(HttpMethod.GET, "/api/v1/donations/fake/" + ref, stranger.uid(), null, 404);
        JsonNode page =
                callJson(HttpMethod.GET, "/api/v1/donations/fake/" + ref, donor.uid(), null, 200);
        assertThat(page.path("amount").decimalValue()).isEqualByComparingTo("10.00");
        assertThat(page.path("summary").asString()).contains("Voluntary support");

        confirm(donor, ref, null, 202);
        JsonNode mine =
                awaitJson(
                        "/api/v1/me/donations",
                        donor.uid(),
                        body -> "SUCCEEDED".equals(body.path(0).path("status").asString()));
        assertThat(mine.path(0).path("succeededAt").asString()).isNotBlank();
        confirm(donor, ref, null, 409);

        JsonNode supporters =
                callJson(HttpMethod.GET, "/api/v1/public/donations/supporters", null, null, 200);
        assertThat(supporters.path("label").asString()).isEqualTo("Voluntary support");
        assertThat(supporters.path("supporters").toString())
                .contains(displayName)
                .doesNotContain("10.00")
                .doesNotContain("Thanks for the app")
                .doesNotContain(donor.id().toString());

        // A donor who did not opt in is never listed.
        Member quiet = member("donor-quiet");
        String quietName = "Quiet Donor " + quiet.uid().substring(quiet.uid().length() - 6);
        profile(quiet, quietName);
        String quietRef = ref(checkout(quiet, "5.00", "USD", null, false, 201));
        confirm(quiet, quietRef, null, 202);
        awaitJson(
                "/api/v1/me/donations",
                quiet.uid(),
                body -> "SUCCEEDED".equals(body.path(0).path("status").asString()));
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/public/donations/supporters",
                                        null,
                                        null,
                                        200)
                                .toString())
                .doesNotContain(quietName);

        // Voluntary support never touches ratings or interactions.
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM rating_summary WHERE user_id = ?",
                                donor.id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE user_a = ? OR user_b = ?",
                                donor.id(),
                                donor.id()))
                .isZero();
    }

    @Test
    void failuresValidationAndSignedIdempotentWebhooks() {
        Member donor = member("donor-fail");
        String ref = ref(checkout(donor, "7.50", "CAD", null, false, 201));
        confirm(donor, ref, "FAILED", 202);
        awaitJson(
                "/api/v1/me/donations",
                donor.uid(),
                body -> "FAILED".equals(body.path(0).path("status").asString()));

        String second = ref(checkout(donor, "3.00", "CAD", null, false, 201));
        SignedWebhook webhook =
                fakeProvider.syntheticEvent(
                        FakeDonationProvider.DONATION_SUCCEEDED, Map.of("checkoutRef", second));
        assertThat(
                        json(postWebhook(WEBHOOK, webhook.payload(), webhook.headers()))
                                .path("duplicate")
                                .asBoolean())
                .isFalse();
        assertThat(
                        json(postWebhook(WEBHOOK, webhook.payload(), webhook.headers()))
                                .path("duplicate")
                                .asBoolean())
                .isTrue();
        EntityExchangeResult<byte[]> forged =
                postWebhook(
                        WEBHOOK,
                        webhook.payload(),
                        Map.of(FakeDonationProvider.SIGNATURE_HEADER, "t=1,v1=00"));
        assertThat(forged.getStatus().value()).isEqualTo(400);
        assertThat(errorCode(json(forged))).isEqualTo("WEBHOOK_SIGNATURE_INVALID");
        assertThat(
                        postWebhook("/api/v1/webhooks/donations/stripe", "{}", Map.of())
                                .getStatus()
                                .value())
                .isEqualTo(404);
        awaitJson(
                "/api/v1/me/donations",
                donor.uid(),
                body -> "SUCCEEDED".equals(body.path(0).path("status").asString()));

        assertThat(errors(checkout(donor, "1.00", "CAD", null, false, 400))).contains("amount");
        assertThat(errors(checkout(donor, "600.00", "CAD", null, false, 400))).contains("amount");
        assertThat(errors(checkout(donor, "10.00", "EUR", null, false, 400))).contains("currency");
        checkout(donor, "10.001", "CAD", null, false, 400);
        checkout(donor, "10.00", "CAD", "x".repeat(281), false, 400);
        callJson(
                HttpMethod.POST,
                "/api/v1/donations/checkout",
                null,
                Map.of("amount", "10.00", "currency", "CAD"),
                401);
    }

    @Test
    void adminsSeeTotalsAndOnlySuperAdminsRefundAndChangeSettings() {
        Member donor = member("donor-admin");
        String ref = ref(checkout(donor, "20.00", "CAD", "Fictional note", true, 201));
        confirm(donor, ref, null, 202);
        JsonNode mine =
                awaitJson(
                        "/api/v1/me/donations",
                        donor.uid(),
                        body -> "SUCCEEDED".equals(body.path(0).path("status").asString()));
        String donationId = mine.path(0).path("id").asString();
        String admin = staff("donor-admin-staff", Role.ADMIN);
        String superAdmin = staff("donor-super-staff", Role.SUPER_ADMIN);

        JsonNode list =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/donations?status=SUCCEEDED",
                        admin,
                        null,
                        200);
        assertThat(list.path("donations").path("totalItems").asInt()).isPositive();
        assertThat(list.path("totals").toString()).contains("CAD");
        JsonNode detail =
                callJson(HttpMethod.GET, "/api/v1/admin/donations/" + donationId, admin, null, 200);
        assertThat(detail.path("donation").path("message").asString()).isEqualTo("Fictional note");
        assertThat(detail.path("webhooks").get(0).path("status").asString()).isEqualTo("PROCESSED");

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/donations/" + donationId + "/refund",
                admin,
                null,
                403);
        JsonNode refunded =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/donations/" + donationId + "/refund",
                        superAdmin,
                        null,
                        200);
        assertThat(refunded.path("donation").path("status").asString()).isEqualTo("REFUNDED");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/donations/" + donationId + "/refund",
                superAdmin,
                null,
                409);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action = 'donation.refund'"
                                        + " AND target_id = ?",
                                donationId))
                .isEqualTo(1);

        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/donations/settings",
                admin,
                Map.of("minAmount", "1.00"),
                403);
        callJson(
                HttpMethod.PUT,
                "/api/v1/admin/donations/settings",
                superAdmin,
                Map.of("minAmount", "600.00"),
                400);
        JsonNode settings =
                callJson(HttpMethod.GET, "/api/v1/admin/donations/settings", admin, null, 200);
        assertThat(settings.path("currencies").toString()).contains("CAD").contains("USD");
        assertThat(settings.path("minAmount").decimalValue()).isEqualByComparingTo("2.00");
    }

    // ---------------------------------------------------------------------------------------

    private void profile(Member member, String displayName) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("handle", me(member.uid()).path("handle").asString());
        body.put("displayName", displayName);
        body.put("bio", "");
        body.put("games", java.util.List.of());
        body.put("languages", java.util.List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", member.uid(), body, 200);
    }

    private JsonNode checkout(
            Member donor,
            String amount,
            String currency,
            @Nullable String message,
            boolean publicThanks,
            int expectedStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amount", new java.math.BigDecimal(amount));
        body.put("currency", currency);
        if (message != null) {
            body.put("message", message);
        }
        body.put("publicThanks", publicThanks);
        return callJson(
                HttpMethod.POST, "/api/v1/donations/checkout", donor.uid(), body, expectedStatus);
    }

    private JsonNode confirm(
            Member donor, String ref, @Nullable String outcome, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/donations/fake/" + ref + "/confirm",
                donor.uid(),
                outcome == null ? null : Map.of("outcome", outcome),
                expectedStatus);
    }

    private static String ref(JsonNode checkout) {
        return checkout.path("url")
                .asString()
                .substring(FakeDonationProvider.CHECKOUT_PATH.length());
    }

    private static String errors(JsonNode problem) {
        return problem.path("errors").toString();
    }
}
