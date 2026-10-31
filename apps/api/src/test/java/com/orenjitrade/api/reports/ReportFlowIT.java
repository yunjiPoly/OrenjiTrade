package com.orenjitrade.api.reports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.infra.NoopIdentityAdminClient;
import com.orenjitrade.api.common.seed.SeedWordingTest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Phase 7 collector reporting: reasons, the report confirmation, 409 REPORT_ALREADY_OPEN, 422
 * CANNOT_REPORT_SELF, context validation, Idempotency-Key, the daily rate rule, the moderator queue
 * and detail (private messages of the reported conversation only), assignment, notes and the
 * resolution with its audit row, the REPORT_DECISION notification of the reporter and the warning,
 * suspension and ban actions.
 */
class ReportFlowIT extends AbstractPhase7IT {

    @Autowired private NoopIdentityAdminClient identity;

    @Test
    void reasonsArePublicAndOrdered() {
        JsonNode reasons =
                callJson(HttpMethod.GET, "/api/v1/public/report-reasons", null, null, 200);
        List<String> codes = new ArrayList<>();
        reasons.forEach(reason -> codes.add(reason.path("code").asString()));
        assertThat(codes)
                .containsExactly(
                        "SCAM",
                        "COUNTERFEIT",
                        "HARASSMENT",
                        "SPAM",
                        "INAPPROPRIATE_BEHAVIOR",
                        "MISLEADING_LISTINGS",
                        "OTHER");
        assertThat(reasons.get(0).path("label").asString()).isNotBlank();
        assertThat(reasons.get(0).path("description").asString()).isNotBlank();
        // Deals ship by mail (ADR 0018): no reason speaks of meetups any more.
        assertThat(reasons.get(4).path("description").asString())
                .isEqualTo("Behaviour that breaks the Community Guidelines.");
        List<String> wording = new ArrayList<>();
        reasons.forEach(
                reason -> {
                    wording.addAll(SeedWordingTest.findings(reason.path("label").asString()));
                    wording.addAll(SeedWordingTest.findings(reason.path("description").asString()));
                });
        assertThat(wording).isEmpty();
    }

    @Test
    void reportsCarryAShortNumberAndTheConversationHidesSharedDetails() {
        Collector reporter = member("rn-reporter");
        Collector reported = member("rn-reported");
        Collector other = member("rn-other");
        String conversationId = conversation(reporter, reported);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                reporter.uid(),
                Map.of("kind", "TEXT", "body", "Ship to:\nSam Fictional\n1 Zqaddress Lane"),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                reported.uid(),
                Map.of("kind", "TEXT", "body", "e-Transfer to zqpay@example.test"),
                201);
        // The phone puts a saved detail after what is already typed, on a line of its own.
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                reporter.uid(),
                Map.of(
                        "kind",
                        "TEXT",
                        "body",
                        "Great, thanks!\nShip to:\nRae Zqappended\n88 Zqappendstreet"),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                reported.uid(),
                Map.of(
                        "kind",
                        "TEXT",
                        "body",
                        "Total is $20.\ne-Transfer to zqappended@example.test"),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                reporter.uid(),
                Map.of("kind", "TEXT", "body", "e-Transfer sent!"),
                201);

        // A flag on the reported collector's private message counts among their open flags.
        Object flaggedMessage =
                testUsers
                        .query(
                                "SELECT id FROM message WHERE conversation_id = ?::uuid AND"
                                        + " sender_id = ? ORDER BY created_at LIMIT 1",
                                conversationId,
                                reported.id())
                        .getFirst()
                        .get("id");
        testUsers.update(
                "INSERT INTO moderation_flag (subject_type, subject_id, reason, author_id) VALUES"
                        + " ('MESSAGE', ?, 'BANNED_TERM', ?)",
                flaggedMessage,
                reported.id());

        JsonNode first =
                report(
                        reporter,
                        reported,
                        "SCAM",
                        Map.of("source", "CONVERSATION", "conversationId", conversationId),
                        201);
        JsonNode second = report(other, reported, "SPAM", null, 201);
        String moderator = staff("rn-mod", Role.MODERATOR);
        JsonNode firstDetail =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/reports/" + first.path("id").asString(),
                        moderator,
                        null,
                        200);
        long firstNumber = firstDetail.path("number").asLong();
        assertThat(firstNumber).as("numbers start at 1001").isGreaterThanOrEqualTo(1001);
        JsonNode secondDetail =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/reports/" + second.path("id").asString(),
                        moderator,
                        null,
                        200);
        assertThat(secondDetail.path("number").asLong())
                .as("a later report takes a later number")
                .isGreaterThan(firstNumber);
        assertThat(
                        secondDetail
                                .path("history")
                                .path("recentReports")
                                .get(0)
                                .path("number")
                                .asLong())
                .isPositive();

        // Staff find a report by its number, alone.
        JsonNode found =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/reports?number=" + firstNumber,
                        moderator,
                        null,
                        200);
        assertThat(found.path("totalItems").asLong()).isEqualTo(1);
        assertThat(found.path("items").get(0).path("id").asString())
                .isEqualTo(first.path("id").asString());
        assertThat(found.path("items").get(0).path("number").asLong()).isEqualTo(firstNumber);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/admin/reports?number=99999999",
                                        moderator,
                                        null,
                                        200)
                                .path("totalItems")
                                .asLong())
                .isZero();
        callJson(HttpMethod.GET, "/api/v1/admin/reports?number=0", moderator, null, 400);

        JsonNode openFlags = firstDetail.path("history").path("openFlags");
        assertThat(openFlags).as("the message's flag counts (board A2)").hasSize(1);
        assertThat(openFlags.get(0).path("reason").asString()).isEqualTo("BANNED_TERM");

        // The address and the e-Transfer email are sent as their kind only (spec 15.8.4).
        JsonNode messages = firstDetail.path("conversation").path("messages");
        assertThat(messages).hasSize(5);
        List<String> shared = new ArrayList<>();
        for (JsonNode message : messages) {
            shared.add(
                    message.path("sharedDetail").isNull()
                            ? "-"
                            : message.path("sharedDetail").asString());
            if (!message.path("sharedDetail").isNull()) {
                assertThat(message.path("body").asString()).isEmpty();
            }
        }
        assertThat(shared)
                .containsExactly(
                        "-",
                        "ETRANSFER_EMAIL",
                        "SHIPPING_ADDRESS",
                        "ETRANSFER_EMAIL",
                        "SHIPPING_ADDRESS");
        assertThat(messages.get(0).path("body").asString()).isEqualTo("e-Transfer sent!");
        assertThat(firstDetail.toString())
                .doesNotContain("Zqaddress")
                .doesNotContain("zqpay@example.test")
                .doesNotContain("Zqappend")
                .doesNotContain("zqappended@example.test")
                .doesNotContain("Great, thanks!")
                .doesNotContain("Total is $20.");
    }

    @Test
    void reportAdminSeesItResolveAuditAndReporterNotification() {
        Collector reporter = member("rp-reporter");
        Collector reported = member("rp-reported");
        String conversationId = conversation(reporter, reported);
        texts(reported, conversationId, 1);
        texts(reporter, conversationId, 1);

        // Validation: self, unknown collector, foreign context.
        assertThat(report(reporter, reporter, "SPAM", null, 422).path("errorCode").asString())
                .isEqualTo("CANNOT_REPORT_SELF");
        Map<String, Object> unknown = new LinkedHashMap<>();
        unknown.put("reportedUserId", UUID.randomUUID().toString());
        unknown.put("reason", "SPAM");
        callJson(HttpMethod.POST, "/api/v1/reports/collectors", reporter.uid(), unknown, 404);
        Collector stranger = member("rp-stranger");
        JsonNode foreign =
                report(
                        stranger,
                        reported,
                        "HARASSMENT",
                        Map.of("source", "CONVERSATION", "conversationId", conversationId),
                        400);
        assertThat(foreign.path("errors").toString()).contains("context.conversationId");
        callJson(
                HttpMethod.POST,
                "/api/v1/reports/collectors",
                reporter.uid(),
                Map.of("reportedUserId", reported.id().toString()),
                400);

        // The confirmation.
        JsonNode filed =
                report(
                        reporter,
                        reported,
                        "HARASSMENT",
                        Map.of("source", "CONVERSATION", "conversationId", conversationId),
                        201);
        String reportId = filed.path("id").asString();
        assertThat(filed.path("status").asString()).isEqualTo("OPEN");
        assertThat(filed.path("createdAt").asString()).isNotBlank();
        JsonNode again = report(reporter, reported, "SPAM", null, 409);
        assertThat(again.path("errorCode").asString()).isEqualTo("REPORT_ALREADY_OPEN");
        assertThat(again.path("reportId").asString()).isEqualTo(reportId);
        JsonNode mine = callJson(HttpMethod.GET, "/api/v1/me/reports", reporter.uid(), null, 200);
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).path("status").asString()).isEqualTo("OPEN");
        assertThat(mine.get(0).path("reportedUser").path("handle").asString())
                .isEqualTo(reported.handle());
        assertThat(mine.toString()).doesNotContain("Details written by");

        // Plain collectors never see the queue; moderators do.
        callJson(HttpMethod.GET, "/api/v1/admin/reports", reporter.uid(), null, 403);
        String moderator = staff("rp-mod", Role.MODERATOR);
        JsonNode queue =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/reports?status=OPEN&reportedUserId=" + reported.id(),
                        moderator,
                        null,
                        200);
        assertThat(queue.path("totalItems").asLong()).isEqualTo(1);
        JsonNode summary = queue.path("items").get(0);
        assertThat(summary.path("id").asString()).isEqualTo(reportId);
        assertThat(summary.path("reason").asString()).isEqualTo("HARASSMENT");
        assertThat(summary.path("contextSource").asString()).isEqualTo("CONVERSATION");
        assertThat(summary.path("reporter").path("handle").asString()).isEqualTo(reporter.handle());
        assertThat(summary.path("openReportsAgainstUser").asInt()).isEqualTo(1);

        JsonNode detail =
                callJson(HttpMethod.GET, "/api/v1/admin/reports/" + reportId, moderator, null, 200);
        assertThat(detail.path("details").asString()).startsWith("Details written by");
        assertThat(detail.path("reportedUser").path("status").asString()).isEqualTo("ACTIVE");
        assertThat(detail.path("history").path("openReports").asInt()).isEqualTo(1);
        assertThat(detail.path("history").path("recentReports")).hasSize(1);
        assertThat(detail.path("conversation").path("id").asString()).isEqualTo(conversationId);
        assertThat(detail.path("conversation").path("messages")).hasSize(2);
        assertThat(detail.path("conversation").toString()).contains("Message 0 from");
        assertThat(auditActions("REPORT", reportId)).contains("report.conversation.view");

        // Assignment and notes.
        JsonNode assigned =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/reports/" + reportId + "/assign",
                        moderator,
                        null,
                        200);
        assertThat(assigned.path("status").asString()).isEqualTo("UNDER_REVIEW");
        JsonNode note =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/reports/" + reportId + "/notes",
                        moderator,
                        Map.of("body", "Checked the conversation: insults in message 1."),
                        201);
        assertThat(note.path("body").asString()).startsWith("Checked the conversation");

        // Inconsistent decisions are refused; a moderator may not suspend.
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + reportId + "/resolve",
                moderator,
                Map.of("status", "ACTIONED", "action", "NONE", "note", "x"),
                400);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + reportId + "/resolve",
                moderator,
                Map.of("status", "ACTIONED", "action", "SUSPENDED", "note", "x"),
                403);

        // Resolve with a warning.
        Map<String, Object> resolve = new LinkedHashMap<>();
        resolve.put("status", "ACTIONED");
        resolve.put("action", "WARNING");
        resolve.put("note", "Warned for insults.");
        resolve.put("notifyReporter", true);
        JsonNode resolved =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/reports/" + reportId + "/resolve",
                        moderator,
                        resolve,
                        200);
        assertThat(resolved.path("status").asString()).isEqualTo("ACTIONED");
        assertThat(resolved.path("resolutionAction").asString()).isEqualTo("WARNING");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + reportId + "/resolve",
                moderator,
                resolve,
                409);

        List<Map<String, Object>> audit = auditRows("REPORT", reportId);
        assertThat(audit)
                .extracting(row -> row.get("action"))
                .contains("report.assign", "report.note", "REPORT_RESOLVED");
        Map<String, Object> resolution =
                audit.stream()
                        .filter(row -> "REPORT_RESOLVED".equals(row.get("action")))
                        .findFirst()
                        .orElseThrow();
        assertThat((String) resolution.get("details")).contains("\"action\": \"WARNING\"");
        assertThat(resolution.get("actor_type")).isEqualTo("ADMIN");

        await().atMost(WAIT)
                .until(() -> !notificationsOfType(reporter, "REPORT_DECISION").isEmpty());
        JsonNode decision = notificationsOfType(reporter, "REPORT_DECISION").get(0);
        assertThat(decision.path("data").path("reportId").asString()).isEqualTo(reportId);
        assertThat(decision.toString())
                .doesNotContain("Warned for insults")
                .doesNotContain(reported.handle());
        List<JsonNode> warnings = notificationsOfType(reported, "SYSTEM");
        assertThat(warnings)
                .anySatisfy(
                        warning ->
                                assertThat(warning.path("data").path("kind").asString())
                                        .isEqualTo("MODERATION_WARNING"));
        assertThat(
                        callJson(HttpMethod.GET, "/api/v1/me/reports", reporter.uid(), null, 200)
                                .get(0)
                                .path("status")
                                .asString())
                .isEqualTo("ACTIONED");

        // A new report is possible once the previous one is decided.
        report(reporter, reported, "SPAM", null, 201);
    }

    @Test
    void adminsSuspendAndBanThroughDecisions() {
        Collector reporter = member("rp-sus-reporter");
        Collector reported = member("rp-sus-reported");
        Collector banned = member("rp-ban-reported");
        String admin = staff("rp-admin", Role.ADMIN);
        String first = report(reporter, reported, "SCAM", null, 201).path("id").asString();
        String second = report(reporter, banned, "COUNTERFEIT", null, 201).path("id").asString();

        Map<String, Object> suspend = new LinkedHashMap<>();
        suspend.put("status", "ACTIONED");
        suspend.put("action", "SUSPENDED");
        suspend.put("note", "Took payment without shipping.");
        suspend.put("suspendUntil", java.time.Instant.now().plusSeconds(86_400 * 7).toString());
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + first + "/resolve",
                admin,
                suspend,
                200);
        Map<String, Object> account = testUsers.row(reported.id());
        assertThat(account.get("status")).isEqualTo("SUSPENDED");
        assertThat(account.get("suspended_until")).isNotNull();
        assertThat(account.get("banned_at")).isNull();
        assertThat(testUsers.auditRowsFor(reported.id()))
                .extracting(row -> row.get("action"))
                .contains("user.suspend");
        callJson(HttpMethod.GET, "/api/v1/me", reported.uid(), null, 403);
        assertThat(identity.isDisabled(reported.uid()))
                .as("owner decision of 2026-10-28: a suspension leaves the login on")
                .isFalse();

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/reports/" + second + "/resolve",
                admin,
                Map.of("status", "ACTIONED", "action", "BANNED", "note", "Counterfeit cards."),
                200);
        Map<String, Object> bannedAccount = testUsers.row(banned.id());
        assertThat(bannedAccount.get("status")).isEqualTo("SUSPENDED");
        assertThat(bannedAccount.get("suspended_until")).isNull();
        assertThat(bannedAccount.get("banned_at")).isNotNull();
        JsonNode adminDetail =
                callJson(HttpMethod.GET, "/api/v1/admin/users/" + banned.id(), admin, null, 200);
        assertThat(adminDetail.path("bannedAt").asString()).isNotBlank();
        assertThat(testUsers.auditRowsFor(banned.id()))
                .extracting(row -> row.get("action"))
                .contains("user.ban");
        assertThat(identity.isDisabled(banned.uid())).as("a ban disables the login").isTrue();

        // Lifting the suspension also lifts the ban mark.
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/users/" + banned.id() + "/unsuspend",
                admin,
                null,
                204);
        assertThat(testUsers.row(banned.id()).get("banned_at")).isNull();
        assertThat(identity.isDisabled(banned.uid())).isFalse();

        // The reported collector's history lists the decisions.
        JsonNode history =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/users/" + banned.id() + "/history",
                        admin,
                        null,
                        200);
        assertThat(history.path("recentReports")).hasSize(1);
        assertThat(history.path("recentReports").get(0).path("resolutionAction").asString())
                .isEqualTo("BANNED");
        assertThat(history.path("suspensions").toString())
                .contains("user.ban")
                .contains("user.unsuspend");
    }

    @Test
    void idempotencyKeyAndDailyRateLimit() {
        Collector reporter = member("rp-rate");
        List<Collector> targets = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            targets.add(member("rp-target" + index));
        }
        String key = "report-" + UUID.randomUUID();
        String first = reportWithKey(reporter, targets.get(0), key, 201).path("id").asString();
        assertThat(reportWithKey(reporter, targets.get(0), key, 201).path("id").asString())
                .as("same key, same answer")
                .isEqualTo(first);
        for (int index = 1; index < 5; index++) {
            report(reporter, targets.get(index), "SPAM", null, 201);
        }
        JsonNode limited = report(reporter, targets.get(5), "SPAM", null, 429);
        assertThat(limited.path("errorCode").asString()).isEqualTo("RATE_LIMITED");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM collector_report WHERE reporter_id = ?",
                                reporter.id()))
                .isEqualTo(5);
    }

    private JsonNode reportWithKey(Collector reporter, Collector reported, String key, int status) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reportedUserId", reported.id().toString());
        body.put("reason", "SPAM");
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/api/v1/reports/collectors")
                        .header(HttpHeaders.AUTHORIZATION, bearer(reporter.uid()))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .exchange()
                        .expectBody()
                        .returnResult();
        assertThat(result.getStatus().value()).isEqualTo(status);
        return json(result);
    }
}
