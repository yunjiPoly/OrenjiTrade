package com.orenjitrade.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.AbstractIntegrationTest;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.moderation.domain.ModerationService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Auto-moderation of private messages (Phase 5 contract "Auto-moderation hooks") and the moderator
 * flag queue: BLOCK banned terms are refused with 422 MESSAGE_BLOCKED and store nothing, FLAG terms
 * and repeated content store the message FLAGGED with a flag, a FLAG rate rule flags the author,
 * and moderators list and resolve flags (audited) while collectors get 403.
 */
class ModerationIT extends AbstractIntegrationTest {

    @Autowired private ModerationService moderationService;

    private record Member(String uid, UUID id) {}

    @BeforeEach
    void freshRules() {
        moderationService.invalidate();
    }

    private Member member(String prefix, Role... roles) {
        String uid = uniqueUid(prefix);
        UUID id = roles.length == 0 ? provisionCompliant(uid) : provisionWithRoles(uid, roles);
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("handle", me(uid).path("handle").asString());
        profile.put("displayName", "Collector " + prefix);
        profile.put("bio", "");
        profile.put("games", List.of("mtg"));
        profile.put("languages", List.of("en"));
        callJson(HttpMethod.PUT, "/api/v1/me/profile", uid, profile, 200);
        return new Member(uid, id);
    }

    private String conversation(Member from, Member to) {
        return callJson(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        from.uid(),
                        Map.of("recipientId", to.id().toString()),
                        201)
                .path("id")
                .asString();
    }

    private JsonNode send(Member from, String conversationId, String text, int expectedStatus) {
        return callJson(
                HttpMethod.POST,
                "/api/v1/conversations/" + conversationId + "/messages",
                from.uid(),
                Map.of("kind", "TEXT", "body", text),
                expectedStatus);
    }

    @Test
    void bannedTermsBlockOrFlagMessages() {
        Member a = member("ban-a");
        Member b = member("ban-b");
        String id = conversation(a, b);

        JsonNode blocked = send(a, id, "Great prices at Zörblax, trust me", 422);
        assertThat(blocked.path("errorCode").asString()).isEqualTo("MESSAGE_BLOCKED");
        assertThat(blocked.path("message").asString())
                .as("generic reason, the matching rule is not disclosed")
                .doesNotContainIgnoringCase("zorblax");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM message WHERE conversation_id = ?::uuid", id))
                .isZero();
        assertThat(
                        testUsers.query(
                                "SELECT last_message_id FROM conversation WHERE id = ?::uuid", id))
                .singleElement()
                .satisfies(row -> assertThat(row.get("last_message_id")).isNull());

        JsonNode flagged = send(a, id, "Have a look at fnordpromo later", 201);
        assertThat(flagged.path("moderationState").asString()).isEqualTo("FLAGGED");
        assertThat(flagged.path("body").asString()).isEqualTo("Have a look at fnordpromo later");
        List<Map<String, Object>> flags =
                testUsers.query(
                        "SELECT subject_type, reason, rule_id, author_id FROM moderation_flag WHERE"
                                + " subject_id = ?::uuid",
                        flagged.path("id").asString());
        assertThat(flags)
                .singleElement()
                .satisfies(
                        row -> {
                            assertThat(row.get("subject_type")).isEqualTo("MESSAGE");
                            assertThat(row.get("reason")).isEqualTo("BANNED_TERM");
                            assertThat(row.get("rule_id")).isNotNull();
                            assertThat(row.get("author_id")).isEqualTo(a.id());
                        });
        // The recipient sees FLAGGED messages normally.
        JsonNode thread =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/conversations/" + id + "/messages",
                        b.uid(),
                        null,
                        200);
        assertThat(thread.path("items").get(0).path("moderationState").asString())
                .isEqualTo("FLAGGED");
    }

    @Test
    void repeatedContentIsFlaggedNotBlocked() {
        Member a = member("rep-a");
        Member b = member("rep-b");
        Member c = member("rep-c");
        String first = conversation(a, b);
        String second = conversation(a, c);
        for (int index = 0; index < 5; index++) {
            JsonNode ok =
                    send(
                            a,
                            index % 2 == 0 ? first : second,
                            "Is your binder still up to date?",
                            201);
            assertThat(ok.path("moderationState").asString()).isEqualTo("OK");
        }
        JsonNode sixth = send(a, second, "is your   binder still UP to date?", 201);
        assertThat(sixth.path("moderationState").asString()).isEqualTo("FLAGGED");
        assertThat(
                        testUsers.query(
                                "SELECT reason FROM moderation_flag WHERE subject_id = ?::uuid",
                                sixth.path("id").asString()))
                .extracting(row -> row.get("reason"))
                .containsExactly("REPEATED_CONTENT");
        // Different text is fine again.
        assertThat(
                        send(a, first, "Different words entirely", 201)
                                .path("moderationState")
                                .asString())
                .isEqualTo("OK");
    }

    @Test
    void aFlagRateRuleFlagsTheAuthorOnceWithoutBlocking() {
        UUID ruleId = UUID.randomUUID();
        testUsers.update(
                "INSERT INTO moderation_rule (id, kind, pattern, action, scope) VALUES (?,"
                        + " 'RATE_LIMIT', '3/60', 'FLAG', 'MESSAGE')",
                ruleId);
        moderationService.invalidate();
        try {
            Member a = member("thr-a");
            Member b = member("thr-b");
            String id = conversation(a, b);
            for (int index = 1; index <= 6; index++) {
                send(a, id, "Fast message " + index, 201);
            }
            assertThat(
                            testUsers.query(
                                    "SELECT subject_type, reason, rule_id FROM moderation_flag"
                                            + " WHERE subject_id = ?",
                                    a.id()))
                    .singleElement()
                    .satisfies(
                            row -> {
                                assertThat(row.get("subject_type")).isEqualTo("USER");
                                assertThat(row.get("reason")).isEqualTo("RATE_THRESHOLD");
                                assertThat(row.get("rule_id")).isEqualTo(ruleId);
                            });
        } finally {
            testUsers.update("DELETE FROM moderation_rule WHERE id = ?", ruleId);
            moderationService.invalidate();
        }
    }

    @Test
    void moderatorsListAndResolveFlagsWithAnAudit() {
        Member a = member("queue-a");
        Member b = member("queue-b");
        Member moderator = member("queue-mod", Role.MODERATOR);
        Member admin = member("queue-admin", Role.ADMIN);
        String id = conversation(a, b);
        String messageId = send(a, id, "fnordpromo again", 201).path("id").asString();
        String flagId =
                String.valueOf(
                        testUsers
                                .query(
                                        "SELECT id FROM moderation_flag WHERE subject_id = ?::uuid",
                                        messageId)
                                .get(0)
                                .get("id"));

        callJson(HttpMethod.GET, "/api/v1/admin/moderation/flags", a.uid(), null, 403);
        JsonNode open =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/moderation/flags?size=100",
                        moderator.uid(),
                        null,
                        200);
        JsonNode flag = null;
        for (JsonNode item : open.path("items")) {
            if (item.path("id").asString().equals(flagId)) {
                flag = item;
            }
        }
        assertThat(flag).as("the new flag is in the open queue").isNotNull();
        assertThat(flag.path("subjectType").asString()).isEqualTo("MESSAGE");
        assertThat(flag.path("subjectId").asString()).isEqualTo(messageId);
        assertThat(flag.path("reason").asString()).isEqualTo("BANNED_TERM");
        assertThat(flag.path("authorId").asString()).isEqualTo(a.id().toString());
        assertThat(flag.path("authorHandle").asString()).isNotBlank();
        assertThat(flag.path("state").asString()).isEqualTo("OPEN");
        assertThat(flag.toString())
                .as("no message text in the queue")
                .doesNotContain("fnordpromo again");
        callJson(
                HttpMethod.GET,
                "/api/v1/admin/moderation/flags?subjectType=MESSAGE",
                admin.uid(),
                null,
                200);

        JsonNode resolved =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/moderation/flags/" + flagId + "/resolve",
                        moderator.uid(),
                        Map.of("note", "Checked, harmless"),
                        200);
        assertThat(resolved.path("state").asString()).isEqualTo("RESOLVED");
        assertThat(resolved.path("resolvedBy").asString()).isEqualTo(moderator.id().toString());
        assertThat(resolved.path("resolutionNote").asString()).isEqualTo("Checked, harmless");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/moderation/flags/" + flagId + "/resolve",
                moderator.uid(),
                Map.of(),
                409);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/moderation/flags/" + UUID.randomUUID() + "/resolve",
                moderator.uid(),
                Map.of(),
                404);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/moderation/flags/" + flagId + "/resolve",
                a.uid(),
                Map.of(),
                403);
        JsonNode resolvedList =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/moderation/flags?state=RESOLVED&size=100",
                        moderator.uid(),
                        null,
                        200);
        boolean listed = false;
        for (JsonNode item : resolvedList.path("items")) {
            listed |= item.path("id").asString().equals(flagId);
        }
        assertThat(listed).isTrue();
        assertThat(
                        testUsers.query(
                                "SELECT action, actor_user_id FROM audit_log WHERE target_type ="
                                        + " 'MODERATION_FLAG' AND target_id = ?",
                                flagId))
                .singleElement()
                .satisfies(
                        row -> {
                            assertThat(row.get("action")).isEqualTo("moderation.flag.resolve");
                            assertThat(row.get("actor_user_id")).isEqualTo(moderator.id());
                        });
        callJson(
                HttpMethod.GET,
                "/api/v1/admin/moderation/flags?state=SOMETIMES",
                moderator.uid(),
                null,
                400);
    }
}
