package com.orenjitrade.api.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.orenjitrade.api.auth.web.ServiceAuthFilter;
import com.orenjitrade.api.messaging.MessagingTestSupport.Member;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Account deletion and the chat (WC review R2-2): the job erases what the deleted account wrote,
 * and no copy of that text outlives it, not even the conversation's last-message preview that the
 * other collector's inbox shows. The deletion runs through the real path: a deletion request, the
 * grace period moved back, the account deletion job.
 */
class MessagingAccountDeletionIT extends AbstractMessagingIT {

    private static final String SERVICE_TOKEN = "local-service-token";

    @Test
    void theDeletionLeavesNoPreviewOfTheErasedMessages() {
        Member leaving = member("del-chat-leaving");
        Member keeper = member("del-chat-keeper");
        Member other = member("del-chat-other");
        String suffix = Long.toString(System.nanoTime() % 1_000_000);
        String address = "12 Fictional Lane " + suffix + ", Moncton NB E1A 0A0";
        String email = "leaving." + suffix + "@example.test";

        // The deleted account's message is the last one (an address after the keeper's question).
        String lastIsLeaving = start(keeper, leaving, 201);
        sendText(keeper, lastIsLeaving, "Where should I ship it?");
        sendText(leaving, lastIsLeaving, "Ship to " + address);
        // The other collector answered last: their own preview stays.
        String lastIsOther = start(other, leaving, 201);
        sendText(leaving, lastIsOther, "My e-Transfer email is " + email);
        sendText(other, lastIsOther, "Thanks, payment sent");
        // Every message is the deleted account's.
        Member third = member("del-chat-third");
        String onlyLeaving = start(third, leaving, 201);
        sendText(leaving, onlyLeaving, "Pay me at " + email);

        assertThat(summaryOf(keeper, lastIsLeaving).path("lastMessage").path("preview").asString())
                .as("before the deletion the inbox shows the address")
                .contains(address);

        deleteThroughTheJob(leaving);

        JsonNode keeperSummary = summaryOf(keeper, lastIsLeaving);
        assertThat(keeperSummary.isMissingNode()).as("the conversation stays").isFalse();
        assertThat(keeperSummary.path("lastMessage").path("preview").asString())
                .as("the newest message left becomes the last one")
                .isEqualTo("Where should I ship it?");
        assertThat(keeperSummary.path("lastMessage").path("senderId").asString())
                .isEqualTo(keeper.id().toString());
        assertThat(conversations(keeper).toString()).doesNotContain(address);
        assertThat(messages(keeper, lastIsLeaving).toString()).doesNotContain(address);

        JsonNode otherSummary = summaryOf(other, lastIsOther);
        assertThat(otherSummary.path("lastMessage").path("preview").asString())
                .as("a conversation whose last message is the other collector's keeps it")
                .isEqualTo("Thanks, payment sent");
        assertThat(conversations(other).toString()).doesNotContain(email);

        JsonNode thirdSummary = summaryOf(third, onlyLeaving);
        assertThat(thirdSummary.isMissingNode())
                .as("the third collector created it, so it stays in their inbox")
                .isFalse();
        assertThat(thirdSummary.path("lastMessage").isNull()).as("no last message left").isTrue();
        assertThat(conversations(third).toString()).doesNotContain(email);

        List<Map<String, Object>> stored =
                testUsers.query(
                        "SELECT id, last_message_id, last_message_at, last_message_preview,"
                                + " last_message_kind, last_message_sender_id FROM conversation"
                                + " WHERE id IN (?, ?, ?)",
                        UUID.fromString(lastIsLeaving),
                        UUID.fromString(lastIsOther),
                        UUID.fromString(onlyLeaving));
        assertThat(stored).hasSize(3);
        for (Map<String, Object> row : stored) {
            assertThat(String.valueOf(row.get("last_message_preview")))
                    .doesNotContain(address)
                    .doesNotContain(email);
            assertThat(row.get("last_message_sender_id")).isNotEqualTo(leaving.id());
        }
        Map<String, Object> cleared =
                stored.stream()
                        .filter(row -> row.get("id").toString().equals(onlyLeaving))
                        .findFirst()
                        .orElseThrow();
        assertThat(cleared.get("last_message_id")).isNull();
        assertThat(cleared.get("last_message_at")).isNull();
        assertThat(cleared.get("last_message_preview")).isNull();
        assertThat(cleared.get("last_message_kind")).isNull();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM conversation WHERE last_message_preview LIKE"
                                        + " ? OR last_message_preview LIKE ?",
                                "%" + address + "%",
                                "%" + email + "%"))
                .as("no conversation keeps a preview of the erased text")
                .isZero();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM message WHERE sender_id = ? AND (body <> ''"
                                        + " OR payload <> '{}'::jsonb OR deleted_at IS NULL)",
                                leaving.id()))
                .as("the messages themselves are erased")
                .isZero();
    }

    /** Requests the deletion, moves its grace period back and runs the account deletion job. */
    private void deleteThroughTheJob(Member member) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reason", "Leaving");
        body.put("exportFirst", false);
        String requestId =
                callJson(HttpMethod.POST, "/api/v1/me/deletion-requests", member.uid(), body, 201)
                        .path("id")
                        .asString();
        testUsers.update(
                "UPDATE account_deletion_request SET scheduled_for = now() - interval '1 minute'"
                        + " WHERE id = ?",
                UUID.fromString(requestId));
        JsonNode result =
                json(
                        http.post()
                                .uri("/internal/jobs/account-deletion")
                                .header(ServiceAuthFilter.SERVICE_TOKEN_HEADER, SERVICE_TOKEN)
                                .exchange()
                                .expectStatus()
                                .isOk()
                                .expectBody()
                                .returnResult());
        assertThat(result.path("failed").asInt()).isZero();
        assertThat(testUsers.row(member.id()).get("status")).isEqualTo("DELETED");
    }
}
