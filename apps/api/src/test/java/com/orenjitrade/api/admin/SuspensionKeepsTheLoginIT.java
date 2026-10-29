package com.orenjitrade.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.auth.infra.StaticIdentityTokenVerifier;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Owner decision of 2026-10-28 (R8 follow-up 2, R12 follow-up 3): a suspension leaves the login on,
 * so a suspended collector stays signed in, or signs in again, and the phone shows "Account
 * suspended" (screen 44) with its end date from {@code 403 ACCOUNT_SUSPENDED} and {@code
 * suspendedUntil}. The API keeps refusing every non-public request of the account; a ban keeps
 * disabling the login; lifting a suspension keeps enabling it (accounts disabled under the earlier
 * rule get their login back); an expired suspension lets the account act as before. The identity
 * client of the test profile records every call ({@link NoopIdentityAdminClient#callsFor}).
 */
class SuspensionKeepsTheLoginIT extends AbstractPhase7IT {

    /** The fields of every problem (RFC 9457 plus the platform's own). */
    private static final List<String> PROBLEM_FIELDS =
            List.of(
                    "type",
                    "title",
                    "status",
                    "detail",
                    "instance",
                    "errorCode",
                    "message",
                    "requestId",
                    "timestamp");

    @Autowired private NoopIdentityAdminClient identity;

    @Autowired private StringRedisTemplate redis;

    private static Map<String, Object> suspension(String reason, @Nullable Instant until) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reason", reason);
        body.put("until", until == null ? null : until.toString());
        return body;
    }

    /** One request of every kind a suspended collector could still try, each refused. */
    private void assertEveryRequestRefused(Collector collector, @Nullable Instant until) {
        JsonNode me = callJson(HttpMethod.GET, "/api/v1/me", collector.uid(), null, 403);
        assertThat(me.path("errorCode").asString()).isEqualTo("ACCOUNT_SUSPENDED");
        assertThat(me.path("message").asString()).isEqualTo("This account is suspended");
        if (until == null) {
            assertThat(me.has("suspendedUntil")).as("no end date for an open-ended one").isFalse();
        } else {
            assertThat(me.path("suspendedUntil").asString()).isEqualTo(until.toString());
        }
        // Screen 44's payload holds nothing else: no e-mail, handle, reason or note (review fix 1,
        // P4 and F7).
        List<String> fields = new ArrayList<>(PROBLEM_FIELDS);
        if (until != null) {
            fields.add("suspendedUntil");
        }
        assertThat(me.properties().stream().map(Map.Entry::getKey).toList())
                .as("the fields of 403 ACCOUNT_SUSPENDED")
                .containsExactlyInAnyOrderElementsOf(fields);
        Collector other = member("susp-other");
        List<Object[]> attempts =
                List.of(
                        new Object[] {HttpMethod.GET, "/api/v1/me/profile", null},
                        new Object[] {HttpMethod.GET, "/api/v1/conversations", null},
                        new Object[] {HttpMethod.GET, "/api/v1/notifications", null},
                        new Object[] {HttpMethod.GET, "/api/v1/inventory/items", null},
                        new Object[] {
                            HttpMethod.POST,
                            "/api/v1/conversations",
                            Map.of("recipientId", other.id().toString())
                        },
                        new Object[] {
                            HttpMethod.PUT,
                            "/api/v1/me/profile",
                            Map.of("displayName", "Still here", "bio", "")
                        },
                        new Object[] {
                            HttpMethod.POST, "/api/v1/users/" + other.id() + "/block", null
                        },
                        new Object[] {
                            HttpMethod.POST,
                            "/api/v1/reports/collectors",
                            Map.of("reportedUserId", other.id().toString(), "reason", "SPAM")
                        },
                        new Object[] {
                            HttpMethod.POST,
                            "/api/v1/binders",
                            Map.of("name", "Suspended binder", "visibility", "PUBLIC")
                        },
                        new Object[] {HttpMethod.DELETE, "/api/v1/me/location", null});
        for (Object[] attempt : attempts) {
            JsonNode refused =
                    callJson(
                            (HttpMethod) attempt[0],
                            (String) attempt[1],
                            collector.uid(),
                            attempt[2],
                            403);
            assertThat(refused.path("errorCode").asString())
                    .as("%s %s", attempt[0], attempt[1])
                    .isEqualTo("ACCOUNT_SUSPENDED");
        }
        // Nothing the suspended collector tried was written.
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM user_block WHERE blocker_id = ?",
                                collector.id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM binder WHERE owner_id = ?", collector.id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM collector_report WHERE reporter_id = ?",
                                collector.id()))
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM conversation_participant WHERE user_id = ?",
                                collector.id()))
                .isZero();
    }

    @Test
    void anAdminSuspensionLeavesTheLoginOnAndTheApiRefusesEverything() {
        Collector collector = member("susp-admin-target");
        String admin = staff("susp-admin", Role.ADMIN);
        Instant until = Instant.now().plus(5, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/suspend",
                admin,
                suspension("Moderator's own words", until),
                204);

        assertThat(identity.callsFor(collector.uid()))
                .as("no disable, no revoke: the phone keeps its session and reaches screen 44")
                .isEmpty();
        assertThat(identity.isDisabled(collector.uid())).isFalse();
        // The same token (signed in before) and a new one (signed in again) are both refused by
        // the account's own state, with the end date.
        assertEveryRequestRefused(collector, until);
        JsonNode problem = callJson(HttpMethod.GET, "/api/v1/me", collector.uid(), null, 403);
        assertThat(problem.toString())
                .as("the moderator's internal reason is never sent to the collector")
                .doesNotContain("Moderator's own words");

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/unsuspend",
                admin,
                null,
                204);
        assertThat(identity.callsFor(collector.uid())).containsExactly("enable");
        assertThat(me(collector.uid()).path("status").asString()).isEqualTo("ACTIVE");
    }

    /**
     * Review fix 1 (P5, F10): the refused requests of a suspended account are no activity, and the
     * account keeps the e-mail it was suspended with until the suspension ends.
     */
    @Test
    void aSuspendedAccountsRefusedRequestsWriteNothing() {
        Collector collector = member("susp-quiet");
        String admin = staff("susp-quiet-admin", Role.ADMIN);
        String email = me(collector.uid()).path("email").asString();
        Instant longAgo = Instant.now().minus(10, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/suspend",
                admin,
                suspension("Quiet", Instant.now().plus(2, ChronoUnit.DAYS)),
                204);
        testUsers.update(
                "UPDATE user_account SET last_active_at = ? WHERE id = ?",
                java.sql.Timestamp.from(longAgo),
                collector.id());
        redis.delete("user:last-active:" + collector.id());

        // A new e-mail at the identity provider, then refused requests.
        String changed = "changed-" + collector.uid() + "@example.test";
        http.get()
                .uri("/api/v1/me")
                .header(
                        HttpHeaders.AUTHORIZATION,
                        "Bearer "
                                + StaticIdentityTokenVerifier.PREFIX
                                + collector.uid()
                                + ":"
                                + changed)
                .exchange()
                .expectStatus()
                .isForbidden();
        callJson(HttpMethod.GET, "/api/v1/conversations", collector.uid(), null, 403);
        Map<String, Object> row = testUsers.row(collector.id());
        assertThat(row.get("email")).as("the e-mail waits for the end").isEqualTo(email);
        assertThat(((java.sql.Timestamp) row.get("last_active_at")).toInstant())
                .as("no activity while suspended")
                .isEqualTo(longAgo);
    }

    @Test
    void anOpenEndedSuspensionHasNoEndDate() {
        Collector collector = member("susp-open-target");
        String admin = staff("susp-open-admin", Role.ADMIN);

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/suspend",
                admin,
                suspension("Open-ended", null),
                204);

        assertThat(identity.callsFor(collector.uid())).isEmpty();
        assertEveryRequestRefused(collector, null);
    }

    @Test
    void aReportSuspensionLeavesTheLoginOnAndABanDisablesIt() {
        Collector reporter = member("susp-rp-reporter");
        Collector suspended = member("susp-rp-suspended");
        Collector banned = member("susp-rp-banned");
        String admin = staff("susp-rp-admin", Role.ADMIN);
        String first = report(reporter, suspended, "SCAM", null, 201).path("id").asString();
        String second = report(reporter, banned, "SPAM", null, 201).path("id").asString();
        Instant until = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        Map<String, Object> suspend = new LinkedHashMap<>();
        suspend.put("status", "ACTIONED");
        suspend.put("action", "SUSPENDED");
        suspend.put("note", "The reporter's chat shows it.");
        suspend.put("suspendUntil", until.toString());
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + first + "/resolve",
                admin,
                suspend,
                200);

        assertThat(identity.callsFor(suspended.uid())).isEmpty();
        assertThat(identity.isDisabled(suspended.uid())).isFalse();
        assertEveryRequestRefused(suspended, until);
        assertThat(callJson(HttpMethod.GET, "/api/v1/me", suspended.uid(), null, 403).toString())
                .as("a report's note can hint at the reporter: never sent")
                .doesNotContain("reporter's chat");

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + second + "/resolve",
                admin,
                Map.of("status", "ACTIONED", "action", "BANNED", "note", "Banned."),
                200);
        assertThat(identity.callsFor(banned.uid()))
                .as("a ban keeps disabling the login")
                .containsExactly("disable");
        assertThat(identity.isDisabled(banned.uid())).isTrue();
        assertEveryRequestRefused(banned, null);

        // Lifting the ban enables the login again.
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + banned.id() + "/unsuspend",
                admin,
                null,
                204);
        assertThat(identity.callsFor(banned.uid())).containsExactly("disable", "enable");
        assertThat(identity.isDisabled(banned.uid())).isFalse();
    }

    @Test
    void liftingASuspensionGivesBackALoginDisabledUnderTheEarlierRule() {
        Collector collector = member("susp-old-rule");
        String admin = staff("susp-old-admin", Role.ADMIN);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/suspend",
                admin,
                suspension("Suspended before 2026-10-28", null),
                204);
        // What the earlier rule did at the suspension.
        identity.disableUser(collector.uid());
        assertThat(identity.isDisabled(collector.uid())).isTrue();

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/unsuspend",
                admin,
                null,
                204);
        assertThat(identity.isDisabled(collector.uid())).isFalse();
        assertThat(identity.callsFor(collector.uid())).containsExactly("disable", "enable");
        assertThat(me(collector.uid()).path("status").asString()).isEqualTo("ACTIVE");
    }

    @Test
    void anExpiredSuspensionLetsTheAccountActAsBefore() {
        Collector collector = member("susp-expired");
        String admin = staff("susp-expired-admin", Role.ADMIN);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + collector.id() + "/suspend",
                admin,
                suspension("Short one", Instant.now().plus(1, ChronoUnit.HOURS)),
                204);
        callJson(HttpMethod.GET, "/api/v1/me", collector.uid(), null, 403);

        // The end has passed (today's rule: lifted on the next request).
        UUID id = collector.id();
        testUsers.setStatus(id, AccountStatus.SUSPENDED, Instant.now().minusSeconds(60));
        callJson(HttpMethod.GET, "/api/v1/me", collector.uid(), null, 200);
        callJson(HttpMethod.GET, "/api/v1/conversations", collector.uid(), null, 200);
        assertThat(identity.callsFor(collector.uid())).isEmpty();
    }
}
