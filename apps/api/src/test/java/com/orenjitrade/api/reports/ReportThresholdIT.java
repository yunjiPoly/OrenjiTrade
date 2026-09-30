package com.orenjitrade.api.reports;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import com.orenjitrade.api.auth.domain.Role;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * The report threshold (Phase 7 contract): open reports from 3 distinct reporters within 7 days
 * flag the reported collector for review and pause their public listings pending review; the
 * account is never suspended or banned automatically. Two reporters do nothing. Dismissing the
 * reports lifts the review pause and resolves the flag.
 */
class ReportThresholdIT extends AbstractPhase7IT {

    @Test
    void threeDistinctReportersFlagAndPauseListingsButNeverBan() {
        Collector reported = member("th-reported");
        Collector viewer = member("th-viewer");
        String itemId = publicItem(reported, printing(AZURE), Map.of());
        awaitEventsProcessed(itemId);
        assertThat(publiclyListed(reported, itemId, viewer)).isTrue();

        List<String> reports = new ArrayList<>();
        for (int index = 0; index < 2; index++) {
            Collector reporter = member("th-reporter" + index);
            String id = report(reporter, reported, "SCAM", null, 201).path("id").asString();
            reports.add(id);
            awaitEventsProcessed(id);
        }
        // The same reporter twice is still one reporter.
        Collector repeat = member("th-repeat");
        String repeated = report(repeat, reported, "SPAM", null, 201).path("id").asString();
        awaitEventsProcessed(repeated);
        assertThat(openFlags(reported)).as("3 reporters: threshold reached").isEqualTo(1);
        reports.add(repeated);

        assertThat(testUsers.row(reported.id()).get("status"))
                .as("never an automatic suspension or ban")
                .isEqualTo("ACTIVE");
        assertThat(testUsers.row(reported.id()).get("banned_at")).isNull();
        JsonNode status =
                callJson(HttpMethod.GET, "/api/v1/me/listings/status", reported.uid(), null, 200);
        assertThat(status.path("paused").asBoolean()).isTrue();
        assertThat(status.path("source").asString()).isEqualTo("REPORT_THRESHOLD");
        assertThat(status.path("canResume").asBoolean()).isFalse();
        assertThat(status.path("reason").isNull()).as("no moderator text for the owner").isTrue();
        assertThat(publiclyListed(reported, itemId, viewer)).isFalse();
        await().atMost(WAIT)
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM inventory_item WHERE id ="
                                                        + " ?::uuid AND publicly_listed",
                                                itemId)
                                        == 0);
        // The owner still sees and keeps the item.
        callJson(HttpMethod.GET, "/api/v1/inventory/items/" + itemId, reported.uid(), null, 200);
        // The owner cannot lift a review pause.
        callJson(HttpMethod.POST, "/api/v1/me/listings/resume", reported.uid(), null, 409);
        await().atMost(WAIT)
                .until(
                        () ->
                                notificationsOfType(reported, "SYSTEM").stream()
                                        .anyMatch(
                                                notice ->
                                                        "LISTINGS_PAUSED"
                                                                .equals(
                                                                        notice.path("data")
                                                                                .path("kind")
                                                                                .asString())));
        assertThat(auditActions("USER", reported.id().toString())).contains("listings.pause");

        // The moderation queue shows the flag.
        String moderator = staff("th-mod", Role.MODERATOR);
        JsonNode flags =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/moderation/flags?subjectType=USER&size=100",
                        moderator,
                        null,
                        200);
        boolean flagged = false;
        for (JsonNode flag : flags.path("items")) {
            if (reported.id().toString().equals(flag.path("subjectId").asString())
                    && "REPORT_THRESHOLD".equals(flag.path("reason").asString())) {
                flagged = true;
            }
        }
        assertThat(flagged).isTrue();

        // Dismissing every report ends the review: pause lifted, flag resolved.
        for (String id : reports) {
            callJson(
                    HttpMethod.POST,
                    "/api/v1/admin/reports/" + id + "/resolve",
                    moderator,
                    Map.of("status", "DISMISSED", "action", "NONE", "note", "No violation found"),
                    200);
        }
        assertThat(openFlags(reported)).isZero();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/me/listings/status",
                                        reported.uid(),
                                        null,
                                        200)
                                .path("paused")
                                .asBoolean())
                .isFalse();
        assertThat(publiclyListed(reported, itemId, viewer)).isTrue();
        assertThat(auditActions("USER", reported.id().toString())).contains("listings.resume");
    }

    @Test
    void twoReportersDoNotReachTheThreshold() {
        Collector reported = member("th2-reported");
        for (int index = 0; index < 2; index++) {
            Collector reporter = member("th2-reporter" + index);
            String id = report(reporter, reported, "SPAM", null, 201).path("id").asString();
            awaitEventsProcessed(id);
        }
        assertThat(openFlags(reported)).isZero();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/me/listings/status",
                                        reported.uid(),
                                        null,
                                        200)
                                .path("paused")
                                .asBoolean())
                .isFalse();
    }

    private int openFlags(Collector collector) {
        return testUsers.count(
                "SELECT count(*) FROM moderation_flag WHERE subject_type = 'USER' AND subject_id ="
                        + " ? AND reason = 'REPORT_THRESHOLD' AND resolved_at IS NULL",
                collector.id());
    }
}
