package com.orenjitrade.api.admin;

import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionService;
import com.orenjitrade.api.wishlist.AbstractWishlistIT;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;

/**
 * Helpers of the Phase 7 integration tests (ratings, reports, moderation, delisting, admin
 * console): collectors around a random centre (from {@link AbstractWishlistIT}), staff accounts,
 * conversations, interactions, ratings, reports and audit rows.
 */
public abstract class AbstractPhase7IT extends AbstractWishlistIT {

    @Autowired protected InteractionService interactionService;

    /** A discoverable collector with a complete profile somewhere far from other tests. */
    protected Collector member(String prefix) {
        return collector(prefix, randomCentre());
    }

    /** A compliant account holding {@code role} (plus USER); returns its token uid. */
    protected String staff(String prefix, Role role) {
        String uid = uniqueUid(prefix);
        provisionWithRoles(uid, role);
        return uid;
    }

    /** Starts (or reopens) the conversation of two collectors and returns its id. */
    protected String conversation(Collector from, Collector to) {
        EntityExchangeResult<byte[]> result =
                call(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        from.uid(),
                        Map.of("recipientId", to.id().toString()));
        return json(result).path("id").asString();
    }

    /** Sends {@code count} text messages. */
    protected void texts(Collector from, String conversationId, int count) {
        for (int index = 0; index < count; index++) {
            callJson(
                    HttpMethod.POST,
                    "/api/v1/conversations/" + conversationId + "/messages",
                    from.uid(),
                    Map.of("kind", "TEXT", "body", "Message " + index + " from " + from.handle()),
                    201);
        }
    }

    /** An interaction of {@code kind} between two collectors (as Phase 8 will record them). */
    protected UUID interaction(Collector one, Collector other, InteractionKind kind) {
        return interactionService
                .record(kind, one.id(), other.id(), kind.subjectType(), UUID.randomUUID())
                .id();
    }

    /** Waits until the conversation qualified (3 messages from each side). */
    protected UUID awaitQualified(String conversationId) {
        await().atMost(WAIT)
                .alias("conversation " + conversationId + " qualified")
                .until(
                        () ->
                                testUsers.count(
                                                "SELECT count(*) FROM interaction WHERE kind ="
                                                        + " 'CONVERSATION_QUALIFIED' AND subject_id"
                                                        + " = ?::uuid",
                                                conversationId)
                                        == 1);
        return (UUID)
                testUsers
                        .query(
                                "SELECT id FROM interaction WHERE kind = 'CONVERSATION_QUALIFIED'"
                                        + " AND subject_id = ?::uuid",
                                conversationId)
                        .get(0)
                        .get("id");
    }

    /** A rating body. */
    protected static Map<String, Object> rating(
            UUID interactionId, int overall, @Nullable String comment) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("interactionId", interactionId.toString());
        body.put("overall", overall);
        if (comment != null) {
            body.put("comment", comment);
        }
        return body;
    }

    /** Files a report and returns the answer (status asserted). */
    protected JsonNode report(
            Collector reporter,
            Collector reported,
            String reason,
            @Nullable Map<String, Object> context,
            int expectedStatus) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reportedUserId", reported.id().toString());
        body.put("reason", reason);
        body.put("details", "Details written by " + reporter.handle());
        if (context != null) {
            body.put("context", context);
        }
        return callJson(
                HttpMethod.POST,
                "/api/v1/reports/collectors",
                reporter.uid(),
                body,
                expectedStatus);
    }

    /** Audit rows of a target, oldest first. */
    protected List<Map<String, Object>> auditRows(String targetType, String targetId) {
        return testUsers.query(
                "SELECT action, actor_type, actor_user_id, details::text AS details FROM audit_log"
                        + " WHERE target_type = ? AND target_id = ? ORDER BY occurred_at",
                targetType,
                targetId);
    }

    /** Actions of the audit rows of a target, oldest first. */
    protected List<String> auditActions(String targetType, String targetId) {
        return auditRows(targetType, targetId).stream()
                .map(row -> (String) row.get("action"))
                .toList();
    }

    /** Runs {@code POST /internal/jobs/delist} with the service token. */
    protected JsonNode runDelistJob() {
        EntityExchangeResult<byte[]> result =
                http.post()
                        .uri("/internal/jobs/delist")
                        .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                        .exchange()
                        .expectStatus()
                        .isOk()
                        .expectBody()
                        .returnResult();
        return json(result);
    }

    /** Whether an item appears in the collector's public inventory (seen by {@code viewer}). */
    protected boolean publiclyListed(Collector owner, String itemId, Collector viewer) {
        JsonNode page =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + owner.handle() + "/inventory?size=100",
                        viewer.uid(),
                        null,
                        200);
        for (JsonNode item : page.path("items")) {
            if (itemId.equals(item.path("id").asString())) {
                return true;
            }
        }
        return false;
    }
}
