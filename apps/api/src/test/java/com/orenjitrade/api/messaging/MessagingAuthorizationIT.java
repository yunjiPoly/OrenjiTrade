package com.orenjitrade.api.messaging;

import static com.orenjitrade.api.messaging.MessagingTestSupport.text;
import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.TestDomainEventsConfiguration.RecordedDomainEvents;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.messaging.MessagingTestSupport.Member;
import com.orenjitrade.api.messaging.events.UserBlocked;
import com.orenjitrade.api.messaging.events.UserUnblocked;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Who may see and write what (Phase 5 contract): participants only (404 for everybody else),
 * anonymous callers 401, blocks in either direction hide conversations and forbid new ones (403
 * MESSAGING_BLOCKED), the recipient's messaging permission governs new conversations, suspended
 * recipients cannot be reached, and the collector profile's {@code isBlocked} / {@code canMessage}
 * follow real blocks.
 */
class MessagingAuthorizationIT extends AbstractMessagingIT {

    @Autowired private RecordedDomainEvents recordedEvents;

    @Test
    void nonParticipantsGet404AndAnonymousCallers401() {
        Member a = member("auth-a");
        Member b = member("auth-b");
        Member intruder = member("auth-x");
        String id = start(a, b, 201);
        String messageId = sendText(a, id, "Private").path("id").asString();

        String base = "/api/v1/conversations/" + id;
        assertThat(
                        callJson(HttpMethod.GET, base + "/messages", intruder.uid(), null, 404)
                                .path("errorCode")
                                .asString())
                .isEqualTo("NOT_FOUND");
        callJson(HttpMethod.POST, base + "/messages", intruder.uid(), text("Hi"), 404);
        callJson(
                HttpMethod.POST,
                base + "/read",
                intruder.uid(),
                Map.of("lastReadMessageId", messageId),
                404);
        callJson(HttpMethod.PATCH, base, intruder.uid(), Map.of("muted", true), 404);
        assertThat(conversations(intruder).path("items")).isEmpty();

        assertThat(call(HttpMethod.GET, "/api/v1/conversations", null, null).getStatus().value())
                .isEqualTo(401);
        assertThat(call(HttpMethod.GET, base + "/messages", null, null).getStatus().value())
                .isEqualTo(401);
        assertThat(
                        call(
                                        HttpMethod.POST,
                                        "/api/v1/conversations",
                                        null,
                                        Map.of("recipientId", b.id().toString()))
                                .getStatus()
                                .value())
                .isEqualTo(401);
        assertThat(call(HttpMethod.GET, "/api/v1/me/blocks", null, null).getStatus().value())
                .isEqualTo(401);
        assertThat(
                        call(HttpMethod.POST, "/api/v1/users/" + b.id() + "/block", null, null)
                                .getStatus()
                                .value())
                .isEqualTo(401);
        assertThat(call(HttpMethod.POST, "/api/v1/uploads/images", null, null).getStatus().value())
                .isEqualTo(401);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM message WHERE conversation_id = ?::uuid", id))
                .isEqualTo(1);
    }

    @Test
    void blocksHideConversationsBothWaysAndForbidNewOnes() {
        Member a = member("block-a");
        Member b = member("block-b");
        Member bystander = member("block-c");
        String id = start(a, b, 201);
        sendText(b, id, "Hello");

        JsonNode blocked =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/users/" + b.id() + "/block",
                        a.uid(),
                        Map.of("reason", "Spam offers"),
                        200);
        assertThat(blocked.path("id").asString()).isEqualTo(b.id().toString());
        assertThat(blocked.path("handle").asString()).isEqualTo(b.handle());
        assertThat(blocked.path("blockedAt").asString()).isNotBlank();
        assertThat(blocked.has("reason")).as("the private note is never echoed").isFalse();
        // Idempotent.
        callJson(HttpMethod.POST, "/api/v1/users/" + b.id() + "/block", a.uid(), null, 200);
        assertThat(testUsers.count("SELECT count(*) FROM user_block WHERE blocker_id = ?", a.id()))
                .isEqualTo(1);

        for (Member member : new Member[] {a, b}) {
            assertThat(summaryOf(member, id).isMissingNode())
                    .as("hidden from %s", member.handle())
                    .isTrue();
            callJson(
                    HttpMethod.GET,
                    "/api/v1/conversations/" + id + "/messages",
                    member.uid(),
                    null,
                    404);
            assertThat(
                            callJson(
                                            HttpMethod.POST,
                                            "/api/v1/conversations/" + id + "/messages",
                                            member.uid(),
                                            text("Still there?"),
                                            403)
                                    .path("errorCode")
                                    .asString())
                    .isEqualTo("MESSAGING_BLOCKED");
        }
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/conversations",
                                        b.uid(),
                                        Map.of("recipientId", a.id().toString()),
                                        403)
                                .path("errorCode")
                                .asString())
                .isEqualTo("MESSAGING_BLOCKED");
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations",
                a.uid(),
                Map.of("recipientId", b.id().toString()),
                403);
        // Other collectors are not affected.
        start(bystander, b, 201);

        JsonNode mine = callJson(HttpMethod.GET, "/api/v1/me/blocks", a.uid(), null, 200);
        assertThat(mine).hasSize(1);
        assertThat(mine.get(0).path("id").asString()).isEqualTo(b.id().toString());
        assertThat(callJson(HttpMethod.GET, "/api/v1/me/blocks", b.uid(), null, 200)).isEmpty();

        // Collector profiles now report real blocks both ways.
        JsonNode profile =
                callJson(HttpMethod.GET, "/api/v1/collectors/" + b.handle(), a.uid(), null, 200);
        assertThat(profile.path("isBlocked").asBoolean()).isTrue();
        assertThat(profile.path("canMessage").asBoolean()).isFalse();
        JsonNode reverse =
                callJson(HttpMethod.GET, "/api/v1/collectors/" + a.handle(), b.uid(), null, 200);
        assertThat(reverse.path("isBlocked").asBoolean()).isTrue();

        callJson(HttpMethod.DELETE, "/api/v1/users/" + b.id() + "/block", a.uid(), null, 204);
        callJson(HttpMethod.DELETE, "/api/v1/users/" + b.id() + "/block", a.uid(), null, 204);
        assertThat(summaryOf(a, id).path("unreadCount").asInt()).isEqualTo(1);
        sendText(a, id, "Sorry, unblocked you");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + b.handle(),
                                        a.uid(),
                                        null,
                                        200)
                                .path("canMessage")
                                .asBoolean())
                .isTrue();

        assertThat(recordedEvents.of(UserBlocked.class, event -> event.blockerId().equals(a.id())))
                .hasSize(1);
        assertThat(
                        recordedEvents.of(
                                UserUnblocked.class, event -> event.blockerId().equals(a.id())))
                .hasSize(1);

        callJson(HttpMethod.POST, "/api/v1/users/" + a.id() + "/block", a.uid(), null, 400);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + UUID.randomUUID() + "/block",
                a.uid(),
                null,
                404);
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + b.id() + "/block",
                a.uid(),
                Map.of("reason", "x".repeat(501)),
                400);
    }

    @Test
    void theRecipientsMessagingPermissionGovernsNewConversations() {
        Member recipient = member("perm-r");
        Member withProfile = member("perm-p");
        Member withoutProfile = memberWithoutProfile("perm-n");

        // Default MEMBERS_WITH_PROFILE.
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/conversations",
                                        withoutProfile.uid(),
                                        Map.of("recipientId", recipient.id().toString()),
                                        403)
                                .path("message")
                                .asString())
                .contains("profile");
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + recipient.handle(),
                                        withProfile.uid(),
                                        null,
                                        200)
                                .path("canMessage")
                                .asBoolean())
                .isTrue();
        String existing = start(withProfile, recipient, 201);

        privacy(recipient, "EVERYONE", false);
        start(withoutProfile, recipient, 201);

        privacy(recipient, "NOBODY", false);
        Member late = member("perm-l");
        callJson(
                HttpMethod.POST,
                "/api/v1/conversations",
                late.uid(),
                Map.of("recipientId", recipient.id().toString()),
                403);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + recipient.handle(),
                                        late.uid(),
                                        null,
                                        200)
                                .path("canMessage")
                                .asBoolean())
                .isFalse();
        // Existing conversations continue.
        assertThat(start(withProfile, recipient, 200)).isEqualTo(existing);
        sendText(withProfile, existing, "Are we still on for Saturday?");
    }

    @Test
    void suspendedRecipientsCannotBeReached() {
        Member a = member("susp-a");
        Member b = member("susp-b");
        String id = start(a, b, 201);
        testUsers.setStatus(b.id(), AccountStatus.SUSPENDED, null);
        try {
            callJson(
                    HttpMethod.POST,
                    "/api/v1/conversations",
                    a.uid(),
                    Map.of("recipientId", b.id().toString()),
                    404);
            assertThat(
                            callJson(
                                            HttpMethod.POST,
                                            "/api/v1/conversations/" + id + "/messages",
                                            a.uid(),
                                            text("Hello?"),
                                            403)
                                    .path("errorCode")
                                    .asString())
                    .isEqualTo("MESSAGING_BLOCKED");
            // A suspension that already ended does not count.
            testUsers.setStatus(b.id(), AccountStatus.SUSPENDED, Instant.now().minusSeconds(60));
            sendText(a, id, "Welcome back");
        } finally {
            testUsers.setStatus(b.id(), AccountStatus.ACTIVE, null);
        }
    }
}
