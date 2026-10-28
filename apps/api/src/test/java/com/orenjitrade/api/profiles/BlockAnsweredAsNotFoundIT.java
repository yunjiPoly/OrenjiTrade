package com.orenjitrade.api.profiles;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.client.EntityExchangeResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Owner decision of 2026-10-28 (R13 follow-up 7): a collector you blocked reads your profile and
 * every one of its sections exactly as a handle that does not exist (the same status, errorCode,
 * message and fields; the bodies are compared apart from {@code requestId}, {@code timestamp} and
 * the handle in {@code instance}); you keep your view ("You blocked {handle}", {@code isBlocked},
 * Unblock), also when both blocked each other. Their messages are refused with the words of any
 * collector who cannot receive messages; yours say that you blocked them.
 */
class BlockAnsweredAsNotFoundIT extends AbstractPhase7IT {

    /** The profile and every read under it. */
    private static final List<String> SECTIONS =
            List.of(
                    "",
                    "/inventory?size=10",
                    "/inventory?size=10&excludeDeckCoreItems=true",
                    "/binders",
                    "/wishlist",
                    "/ratings",
                    "/ratings?limit=1",
                    "/references",
                    "/references?limit=1");

    private record Answer(int status, JsonNode body) {}

    private Answer answer(HttpMethod method, String path, String uid, @Nullable Object body) {
        EntityExchangeResult<byte[]> result = call(method, path, uid, body);
        byte[] bytes = result.getResponseBody();
        String text = bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
        return new Answer(result.getStatus().value(), jsonMapper.readTree(text));
    }

    /** The body without what differs per request, the handle in {@code instance} replaced. */
    private static JsonNode comparable(JsonNode body, String handle) {
        ObjectNode copy = (ObjectNode) body.deepCopy();
        copy.remove("requestId");
        copy.remove("timestamp");
        if (copy.has("instance")) {
            copy.put("instance", copy.path("instance").asString().replace(handle, "{handle}"));
        }
        return copy;
    }

    private void block(Collector blocker, Collector blocked) {
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + blocked.id() + "/block",
                blocker.uid(),
                null,
                200);
    }

    private void unblock(Collector blocker, Collector blocked) {
        callJson(
                HttpMethod.DELETE,
                "/api/v1/users/" + blocked.id() + "/block",
                blocker.uid(),
                null,
                204);
    }

    /** The blocker's profile has something in each section the blocked side could read. */
    private Collector blockerWithAProfile(String prefix) {
        Collector blocker = member(prefix);
        Collector rater = member(prefix + "-rater");
        UUID deal = interaction(rater, blocker, InteractionKind.TRADE);
        callJson(
                HttpMethod.POST,
                "/api/v1/ratings",
                rater.uid(),
                rating(deal, 5, "Smooth trade."),
                201);
        callJson(
                HttpMethod.POST,
                "/api/v1/references",
                rater.uid(),
                Map.of("subjectId", blocker.id().toString(), "body", "Ships fast."),
                201);
        return blocker;
    }

    @Test
    void theBlockedSideReadsTheProfileAndEverySectionAsAnUnknownHandle() {
        Collector blocker = blockerWithAProfile("nf-blocker");
        Collector blocked = member("nf-blocked");
        String unknown = "nf_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String base = "/api/v1/collectors/";

        // Before the block, the blocked side reads the profile and its ratings.
        assertThat(answer(HttpMethod.GET, base + blocker.handle(), blocked.uid(), null).status())
                .isEqualTo(200);
        assertThat(
                        answer(
                                        HttpMethod.GET,
                                        base + blocker.handle() + "/ratings",
                                        blocked.uid(),
                                        null)
                                .body()
                                .path("items"))
                .hasSize(1);

        block(blocker, blocked);
        for (String section : SECTIONS) {
            Answer hidden =
                    answer(HttpMethod.GET, base + blocker.handle() + section, blocked.uid(), null);
            Answer missing = answer(HttpMethod.GET, base + unknown + section, blocked.uid(), null);
            assertThat(missing.status()).as("unknown %s", section).isEqualTo(404);
            assertThat(hidden.status()).as("blocked %s", section).isEqualTo(missing.status());
            assertThat(comparable(hidden.body(), blocker.handle()))
                    .as("blocked %s: the unknown handle's body", section)
                    .isEqualTo(comparable(missing.body(), unknown));
            assertThat(hidden.body().toString())
                    .as("nothing of the blocker in %s", section)
                    .doesNotContain(blocker.id().toString())
                    .doesNotContain("Smooth trade")
                    .doesNotContain("Ships fast");
        }

        // The blocker keeps today's view of the collector they blocked.
        JsonNode mine = callJson(HttpMethod.GET, base + blocked.handle(), blocker.uid(), null, 200);
        assertThat(mine.path("isBlocked").asBoolean()).isTrue();
        assertThat(mine.path("canMessage").asBoolean()).isFalse();
        callJson(HttpMethod.GET, base + blocked.handle() + "/ratings", blocker.uid(), null, 200);
        callJson(HttpMethod.GET, base + blocked.handle() + "/references", blocker.uid(), null, 200);
        callJson(HttpMethod.GET, base + blocked.handle() + "/binders", blocker.uid(), null, 404);

        // Both blocked each other: each keeps the blocker's view ("You blocked {handle}").
        block(blocked, blocker);
        assertThat(
                        callJson(HttpMethod.GET, base + blocker.handle(), blocked.uid(), null, 200)
                                .path("isBlocked")
                                .asBoolean())
                .isTrue();
        assertThat(
                        callJson(HttpMethod.GET, base + blocked.handle(), blocker.uid(), null, 200)
                                .path("isBlocked")
                                .asBoolean())
                .isTrue();

        // The first block lifted, the other stays: now the first blocker reads "not found".
        unblock(blocker, blocked);
        assertThat(answer(HttpMethod.GET, base + blocked.handle(), blocker.uid(), null).status())
                .isEqualTo(404);
        assertThat(
                        callJson(HttpMethod.GET, base + blocker.handle(), blocked.uid(), null, 200)
                                .path("isBlocked")
                                .asBoolean())
                .isTrue();

        // No block left: both read each other again.
        unblock(blocked, blocker);
        assertThat(
                        callJson(HttpMethod.GET, base + blocker.handle(), blocked.uid(), null, 200)
                                .path("isBlocked")
                                .asBoolean())
                .isFalse();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        base + blocker.handle() + "/ratings",
                                        blocked.uid(),
                                        null,
                                        200)
                                .path("items"))
                .hasSize(1);
    }

    @Test
    void othersAndSignedOutVisitorsAreNotAffected() {
        Collector blocker = blockerWithAProfile("nf-others");
        Collector blocked = member("nf-others-blocked");
        Collector bystander = member("nf-bystander");
        block(blocker, blocked);
        String base = "/api/v1/collectors/" + blocker.handle();
        assertThat(
                        callJson(HttpMethod.GET, base, bystander.uid(), null, 200)
                                .path("isBlocked")
                                .asBoolean())
                .isFalse();
        callJson(HttpMethod.GET, base + "/ratings", bystander.uid(), null, 200);
        callJson(HttpMethod.GET, base + "/binders", null, null, 200);
        callJson(HttpMethod.GET, base, blocker.uid(), null, 200);
    }

    @Test
    void theBlockedSidesMessagesAreRefusedLikeAnyCollectorWhoCannotReceiveThem() {
        Collector blocker = member("nf-msg-blocker");
        Collector blocked = member("nf-msg-blocked");
        String chat = conversation(blocked, blocker);
        texts(blocked, chat, 1);
        // A collector who cannot receive messages: the other participant is suspended.
        Collector sender = member("nf-msg-sender");
        Collector away = member("nf-msg-away");
        String awayChat = conversation(sender, away);
        testUsers.setStatus(away.id(), AccountStatus.SUSPENDED, null);
        Answer inactive =
                answer(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + awayChat + "/messages",
                        sender.uid(),
                        Map.of("kind", "TEXT", "body", "Hello?"));
        assertThat(inactive.status()).isEqualTo(403);
        assertThat(inactive.body().path("message").asString())
                .isEqualTo("This collector cannot receive messages right now");

        block(blocker, blocked);

        Answer sent =
                answer(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + chat + "/messages",
                        blocked.uid(),
                        Map.of("kind", "TEXT", "body", "Hello?"));
        assertThat(sent.status()).isEqualTo(inactive.status());
        assertThat(comparable(sent.body(), chat))
                .as("the blocked side's refused message reads as for an inactive participant")
                .isEqualTo(comparable(inactive.body(), awayChat));

        Answer started =
                answer(
                        HttpMethod.POST,
                        "/api/v1/conversations",
                        blocked.uid(),
                        Map.of("recipientId", blocker.id().toString()));
        assertThat(started.status()).isEqualTo(inactive.status());
        for (String field : List.of("errorCode", "title", "type", "message", "detail")) {
            assertThat(started.body().path(field))
                    .as("a new conversation refused for a block: %s as for an inactive one", field)
                    .isEqualTo(inactive.body().path(field));
        }

        // The blocker is told why.
        Answer mine =
                answer(
                        HttpMethod.POST,
                        "/api/v1/conversations/" + chat + "/messages",
                        blocker.uid(),
                        Map.of("kind", "TEXT", "body", "Bye"));
        assertThat(mine.status()).isEqualTo(403);
        assertThat(mine.body().path("errorCode").asString()).isEqualTo("MESSAGING_BLOCKED");
        assertThat(mine.body().path("message").asString())
                .isEqualTo("You cannot message this collector");
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/conversations",
                                        blocker.uid(),
                                        Map.of("recipientId", blocked.id().toString()),
                                        403)
                                .path("message")
                                .asString())
                .isEqualTo("You cannot message this collector");

        // Both blocked each other: each is the blocker.
        block(blocked, blocker);
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/conversations/" + chat + "/messages",
                                        blocked.uid(),
                                        Map.of("kind", "TEXT", "body", "Hello?"),
                                        403)
                                .path("message")
                                .asString())
                .isEqualTo("You cannot message this collector");
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM message WHERE conversation_id = ?::uuid",
                                chat))
                .as("nothing was sent after the block")
                .isEqualTo(1);
    }
}
