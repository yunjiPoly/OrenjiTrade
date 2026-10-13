package com.orenjitrade.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.billing.infra.FakeBillingProvider;
import com.orenjitrade.api.billing.infra.FakeBillingProvider.SignedWebhook;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 10 subscriptions end to end with the fake billing provider: checkout, the fake checkout
 * page and its signed synthetic webhook, PREMIUM plan and role with raised limits, cancellation at
 * the period end through the period job, immediate cancellation, failed checkouts, webhook
 * signatures and idempotency, renewals, the reserved mobile receipt route, validation and the admin
 * views.
 */
class SubscriptionFlowIT extends AbstractPhase10IT {

    static final String WEBHOOK = "/api/v1/webhooks/billing/fake";

    @Autowired private FakeBillingProvider fakeProvider;

    @Test
    void fakeCheckoutMakesTheMemberPremiumRaisesLimitsAndCancelEndsIt() {
        Member member = member("sub-flow");
        JsonNode before = plan(member);
        assertThat(before.path("plan").path("code").asString()).isEqualTo("FREE");
        assertThat(before.has("subscription")).isFalse();
        assertThat(limit(before, "binder.views.per_day").path("limit").asInt()).isEqualTo(30);

        JsonNode checkout = checkout(member, "PREMIUM", 200);
        JsonNode subscription = checkout.path("subscription");
        assertThat(subscription.path("status").asString()).isEqualTo("PENDING");
        assertThat(subscription.path("amount").decimalValue()).isEqualByComparingTo("4.99");
        assertThat(checkout.path("resumed").asBoolean()).isFalse();
        String url = checkout.path("url").asString();
        assertThat(url).startsWith(FakeBillingProvider.CHECKOUT_PATH);
        String ref = url.substring(FakeBillingProvider.CHECKOUT_PATH.length());
        String subscriptionId = subscription.path("id").asString();

        // A second checkout of the same plan resumes the open one.
        JsonNode again = checkout(member, "PREMIUM", 200);
        assertThat(again.path("resumed").asBoolean()).isTrue();
        assertThat(again.path("subscription").path("id").asString()).isEqualTo(subscriptionId);

        // The fake checkout page belongs to the member only.
        Member stranger = member("sub-stranger");
        callJson(HttpMethod.GET, "/api/v1/billing/fake/" + ref, stranger.uid(), null, 404);
        JsonNode page =
                callJson(HttpMethod.GET, "/api/v1/billing/fake/" + ref, member.uid(), null, 200);
        assertThat(page.path("status").asString()).isEqualTo("PENDING");
        assertThat(page.path("planCode").asString()).isEqualTo("PREMIUM");
        assertThat(page.path("summary").asString()).contains("no money moves");

        JsonNode receipt = confirm(member, ref, null, 202);
        assertThat(receipt.path("duplicate").asBoolean()).isFalse();
        assertThat(receipt.path("type").asString())
                .isEqualTo(FakeBillingProvider.CHECKOUT_COMPLETED);

        JsonNode premium =
                awaitJson(
                        "/api/v1/me/plan",
                        member.uid(),
                        body -> "PREMIUM".equals(body.path("plan").path("code").asString()));
        assertThat(premium.path("subscription").path("status").asString()).isEqualTo("ACTIVE");
        assertThat(premium.path("subscription").path("currentPeriodEnd").asString()).isNotBlank();
        assertThat(premium.path("subscription").has("checkoutUrl")).isFalse();
        assertThat(limit(premium, "binder.views.per_day").has("limit"))
                .as("PREMIUM views are unlimited")
                .isFalse();
        assertThat(premium.path("features").path("ads.enabled").asBoolean()).isFalse();
        assertThat(premium.toString()).doesNotContain("fake_sub_");
        assertThat(testUsers.rolesOf(member.id())).contains("PREMIUM_USER");
        assertThat(testUsers.row(member.id()).get("plan_code")).isEqualTo("PREMIUM");

        // Already subscribed; the checkout is no longer payable.
        JsonNode conflict = checkout(member, "PREMIUM", 409);
        assertThat(errorCode(conflict)).isEqualTo("ALREADY_SUBSCRIBED");
        assertThat(conflict.path("subscriptionId").asString()).isEqualTo(subscriptionId);
        JsonNode notPending = confirm(member, ref, null, 409);
        assertThat(notPending.path("currentStatus").asString()).isEqualTo("ACTIVE");

        // Cancel at the period end: the plan stays until then (idempotent).
        JsonNode cancelled =
                callJson(
                        HttpMethod.POST, "/api/v1/me/subscription/cancel", member.uid(), null, 200);
        assertThat(cancelled.path("status").asString()).isEqualTo("ACTIVE");
        assertThat(cancelled.path("cancelAtPeriodEnd").asBoolean()).isTrue();
        callJson(
                HttpMethod.POST,
                "/api/v1/me/subscription/cancel",
                member.uid(),
                Map.of("atPeriodEnd", true),
                200);
        assertThat(plan(member).path("plan").path("code").asString()).isEqualTo("PREMIUM");
        assertThat(fakeProvider.calls()).anyMatch(call -> call.endsWith(":period-end"));

        // The period ends: the job cancels it and the FREE plan applies again.
        testUsers.update(
                "UPDATE subscription SET current_period_start = now() - interval '31 days',"
                        + " current_period_end = now() - interval '1 minute' WHERE id = ?::uuid",
                subscriptionId);
        JsonNode run = job("/internal/jobs/subscriptions-period");
        assertThat(run.path("cancelled").asInt()).isGreaterThanOrEqualTo(1);
        JsonNode after = plan(member);
        assertThat(after.path("plan").path("code").asString()).isEqualTo("FREE");
        assertThat(after.has("subscription")).isFalse();
        assertThat(limit(after, "binder.views.per_day").path("limit").asInt()).isEqualTo(30);
        assertThat(testUsers.rolesOf(member.id())).doesNotContain("PREMIUM_USER");
        assertThat(events(subscriptionId))
                .containsSubsequence(
                        "CHECKOUT_STARTED", "ACTIVATED", "CANCEL_REQUESTED", "CANCELLED");
        assertThat(testUsers.jobRuns("subscriptions-period").get(0).get("status"))
                .isEqualTo("SUCCEEDED");
    }

    @Test
    void failedCheckoutsCanBeRetriedAndImmediateCancellationDowngradesAtOnce() {
        Member member = member("sub-retry");
        String ref = ref(checkout(member, "PREMIUM", 200));

        confirm(member, ref, "FAILED", 202);
        JsonNode failed =
                awaitJson(
                        "/api/v1/me/plan",
                        member.uid(),
                        body ->
                                "card_declined"
                                        .equals(
                                                body.path("subscription")
                                                        .path("failureCode")
                                                        .asString()));
        assertThat(failed.path("subscription").path("status").asString()).isEqualTo("PENDING");
        assertThat(failed.path("plan").path("code").asString()).isEqualTo("FREE");

        confirm(member, ref, "SUCCEEDED", 202);
        awaitJson(
                "/api/v1/me/plan",
                member.uid(),
                body -> "ACTIVE".equals(body.path("subscription").path("status").asString()));

        JsonNode ended =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/me/subscription/cancel",
                        member.uid(),
                        Map.of("atPeriodEnd", false),
                        200);
        assertThat(ended.path("status").asString()).isEqualTo("CANCELLED");
        assertThat(ended.path("endedAt").asString()).isNotBlank();
        assertThat(plan(member).path("plan").path("code").asString()).isEqualTo("FREE");
        assertThat(testUsers.rolesOf(member.id())).doesNotContain("PREMIUM_USER");
        callJson(HttpMethod.POST, "/api/v1/me/subscription/cancel", member.uid(), null, 404);

        // A new checkout is possible after the end.
        assertThat(checkout(member, "PREMIUM", 200).path("resumed").asBoolean()).isFalse();
        // Giving up on an open checkout abandons it.
        JsonNode abandoned =
                callJson(
                        HttpMethod.POST, "/api/v1/me/subscription/cancel", member.uid(), null, 200);
        assertThat(abandoned.path("status").asString()).isEqualTo("CANCELLED");
    }

    @Test
    void webhooksAreVerifiedStoredOnceAndRenewalsExtendThePeriod() {
        Member member = member("sub-webhook");
        JsonNode checkout = checkout(member, "PREMIUM", 200);
        String ref = ref(checkout);
        String subscriptionId = checkout.path("subscription").path("id").asString();
        Instant start = Instant.now();
        SignedWebhook webhook =
                fakeProvider.syntheticEvent(
                        FakeBillingProvider.CHECKOUT_COMPLETED,
                        Map.of(
                                "checkoutRef",
                                ref,
                                "subscriptionRef",
                                "fake_sub_" + UUID.randomUUID().toString().replace("-", ""),
                                "periodStart",
                                start.toString(),
                                "periodEnd",
                                start.plusSeconds(30L * 86_400).toString()));

        JsonNode first = json(postWebhook(WEBHOOK, webhook.payload(), webhook.headers()));
        assertThat(first.path("duplicate").asBoolean()).isFalse();
        JsonNode second = json(postWebhook(WEBHOOK, webhook.payload(), webhook.headers()));
        assertThat(second.path("duplicate").asBoolean()).isTrue();
        awaitJson(
                "/api/v1/me/plan",
                member.uid(),
                body -> "ACTIVE".equals(body.path("subscription").path("status").asString()));
        assertThat(events(subscriptionId).stream().filter("ACTIVATED"::equals).count())
                .isEqualTo(1);

        // Bad signature: 400, stored as IGNORED, nothing applied.
        EntityExchangeResult<byte[]> forged =
                postWebhook(
                        WEBHOOK,
                        webhook.payload().replace("evt_fake_", "evt_forged_"),
                        Map.of(FakeBillingProvider.SIGNATURE_HEADER, "t=1,v1=00"));
        assertThat(forged.getStatus().value()).isEqualTo(400);
        assertThat(errorCode(json(forged))).isEqualTo("WEBHOOK_SIGNATURE_INVALID");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM billing_webhook_event WHERE status ="
                                        + " 'IGNORED' AND error = 'INVALID_SIGNATURE'"))
                .isPositive();
        // Only the active provider has a webhook route.
        assertThat(
                        postWebhook("/api/v1/webhooks/billing/stripe", "{}", Map.of())
                                .getStatus()
                                .value())
                .isEqualTo(404);

        // The period ends: the fake provider renews through a synthetic webhook.
        testUsers.update(
                "UPDATE subscription SET current_period_start = now() - interval '30 days',"
                        + " current_period_end = now() - interval '1 minute' WHERE id = ?::uuid",
                subscriptionId);
        assertThat(job("/internal/jobs/subscriptions-period").path("renewalsRequested").asInt())
                .isGreaterThanOrEqualTo(1);
        JsonNode renewed =
                awaitJson(
                        "/api/v1/me/plan",
                        member.uid(),
                        body ->
                                Instant.parse(
                                                body.path("subscription")
                                                        .path("currentPeriodEnd")
                                                        .asString())
                                        .isAfter(Instant.now()));
        assertThat(renewed.path("plan").path("code").asString()).isEqualTo("PREMIUM");
        assertThat(events(subscriptionId)).contains("RENEWAL_REQUESTED", "RENEWED");
    }

    @Test
    void validationAuthorizationAndTheReservedMobileReceiptRoute() {
        Member member = member("sub-valid");
        JsonNode receipt =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/me/subscription/mobile-receipt",
                        member.uid(),
                        Map.of("platform", "APPLE", "receipt", "fictional"),
                        501);
        assertThat(errorCode(receipt)).isEqualTo("NOT_IMPLEMENTED");

        for (String plan : List.of("FREE", "NOPE")) {
            JsonNode invalid = checkout(member, plan, 400);
            assertThat(invalid.path("errors").get(0).path("field").asString())
                    .isEqualTo("planCode");
        }
        for (String provider : List.of("apple", "stripe")) {
            JsonNode invalid =
                    callJson(
                            HttpMethod.POST,
                            "/api/v1/me/subscription/checkout",
                            member.uid(),
                            Map.of("planCode", "PREMIUM", "provider", provider),
                            400);
            assertThat(invalid.path("errors").get(0).path("field").asString())
                    .isEqualTo("provider");
        }
        callJson(HttpMethod.POST, "/api/v1/me/subscription/checkout", member.uid(), Map.of(), 400);
        callJson(
                HttpMethod.POST,
                "/api/v1/me/subscription/checkout",
                null,
                Map.of("planCode", "PREMIUM"),
                401);
        callJson(HttpMethod.POST, "/api/v1/me/subscription/cancel", member.uid(), null, 404);
        callJson(HttpMethod.GET, "/api/v1/billing/fake/fake_cs_unknown", member.uid(), null, 404);
    }

    @Test
    void adminsBrowseSubscriptionsAndCancelOnAMembersBehalf() {
        Member member = member("sub-admin");
        String ref = ref(checkout(member, "PREMIUM", 200));
        confirm(member, ref, null, 202);
        JsonNode active =
                awaitJson(
                        "/api/v1/me/plan",
                        member.uid(),
                        body ->
                                "ACTIVE"
                                        .equals(
                                                body.path("subscription")
                                                        .path("status")
                                                        .asString()));
        String subscriptionId = active.path("subscription").path("id").asString();
        String admin = staff("sub-admin-staff", Role.ADMIN);

        JsonNode list =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/subscriptions?userId=" + member.id(),
                        admin,
                        null,
                        200);
        assertThat(list.path("totalItems").asInt()).isEqualTo(1);
        assertThat(list.path("items").get(0).path("status").asString()).isEqualTo("ACTIVE");
        assertThat(list.path("items").get(0).path("userHandle").asString()).isNotBlank();
        callJson(
                HttpMethod.GET,
                "/api/v1/admin/subscriptions?status=ACTIVE&plan=premium",
                admin,
                null,
                200);

        JsonNode detail =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/subscriptions/" + subscriptionId,
                        admin,
                        null,
                        200);
        assertThat(detail.path("events").size()).isGreaterThanOrEqualTo(2);
        assertThat(detail.path("webhooks").get(0).path("status").asString()).isEqualTo("PROCESSED");
        assertThat(detail.path("webhooks").get(0).path("payload").path("type").asString())
                .isEqualTo(FakeBillingProvider.CHECKOUT_COMPLETED);
        callJson(HttpMethod.GET, "/api/v1/admin/subscriptions", member.uid(), null, 403);

        JsonNode cancelled =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/subscriptions/" + subscriptionId + "/cancel",
                        admin,
                        Map.of("immediately", true, "reason", "Support request"),
                        200);
        assertThat(cancelled.path("subscription").path("status").asString()).isEqualTo("CANCELLED");
        assertThat(plan(member).path("plan").path("code").asString()).isEqualTo("FREE");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/subscriptions/" + subscriptionId + "/cancel",
                admin,
                Map.of("immediately", true),
                409);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE action ="
                                        + " 'subscription.cancel' AND target_id = ?",
                                subscriptionId))
                .isEqualTo(1);
        assertThat(
                        testUsers
                                .query(
                                        "SELECT details::text AS details FROM audit_log WHERE"
                                                + " action = 'subscription.cancel' AND target_id ="
                                                + " ?",
                                        subscriptionId)
                                .get(0)
                                .get("details")
                                .toString())
                .doesNotContain("Support request");
    }

    private JsonNode plan(Member member) {
        return callJson(HttpMethod.GET, "/api/v1/me/plan", member.uid(), null, 200);
    }

    private JsonNode checkout(Member member, String planCode, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/me/subscription/checkout",
                member.uid(),
                Map.of("planCode", planCode),
                expectedStatus);
    }

    private JsonNode confirm(
            Member member, String ref, @Nullable String outcome, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/billing/fake/" + ref + "/confirm",
                member.uid(),
                outcome == null ? null : Map.of("outcome", outcome),
                expectedStatus);
    }

    private static String ref(JsonNode checkout) {
        return checkout.path("url")
                .asString()
                .substring(FakeBillingProvider.CHECKOUT_PATH.length());
    }

    private static JsonNode limit(JsonNode plan, String key) {
        for (JsonNode limit : plan.path("limits")) {
            if (key.equals(limit.path("key").asString())) {
                return limit;
            }
        }
        throw new AssertionError("no limit " + key + " in " + plan);
    }

    private List<String> events(String subscriptionId) {
        return testUsers
                .query(
                        "SELECT event FROM subscription_event WHERE subscription_id = ?::uuid"
                                + " ORDER BY created_at, seq",
                        subscriptionId)
                .stream()
                .map(row -> row.get("event").toString())
                .toList();
    }
}
