package com.orenjitrade.api.delisting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Unresponsiveness strikes (Phase 7 contract "Auto-delisting"): the nightly delist job counts the
 * conversations waiting for a collector's answer for longer than the policy's unansweredAfterHours
 * (72 h) within 30 days; at maxStrikes (3) the collector's public listings are paused (never
 * deleted), the owner is told and resumes by confirming, which restarts the strikes. Answered,
 * recent and blocked conversations never count.
 */
class StrikesIT extends AbstractPhase7IT {

    @Test
    void threeUnansweredConversationsPauseListingsUntilTheOwnerConfirms() {
        Collector seller = member("st-seller");
        Collector viewer = member("st-viewer");
        String itemId = publicItem(seller, printing(AZURE), Map.of());
        assertThat(publiclyListed(seller, itemId, viewer)).isTrue();

        List<String> waiting = new ArrayList<>();
        for (int index = 0; index < 3; index++) {
            Collector buyer = member("st-buyer" + index);
            String conversationId = conversation(buyer, seller);
            texts(buyer, conversationId, 1);
            waiting.add(conversationId);
        }
        // An answered conversation and a recent one never count.
        Collector answered = member("st-answered");
        String answeredId = conversation(answered, seller);
        texts(answered, answeredId, 1);
        texts(seller, answeredId, 1);
        Collector recent = member("st-recent");
        texts(recent, conversation(recent, seller), 1);

        waiting.forEach(this::backdate);
        backdate(answeredId);

        JsonNode run = runDelistJob();
        assertThat(run.path("listingsPaused").asInt()).isGreaterThanOrEqualTo(1);
        Map<String, Object> strikes = responsiveness(seller);
        assertThat(strikes.get("strikes")).isEqualTo(3);
        assertThat(strikes.get("unanswered_conversations_30d")).isEqualTo(3);
        assertThat(strikes.get("pause_source")).isEqualTo("UNRESPONSIVE");
        assertThat(testUsers.jobRuns("delist").get(0).get("status")).isEqualTo("SUCCEEDED");
        assertThat(testUsers.jobRuns("delist").get(0).get("details").toString())
                .contains("\"strikeTracking\": true");

        JsonNode status =
                callJson(HttpMethod.GET, "/api/v1/me/listings/status", seller.uid(), null, 200);
        assertThat(status.path("paused").asBoolean()).isTrue();
        assertThat(status.path("source").asString()).isEqualTo("UNRESPONSIVE");
        assertThat(status.path("canResume").asBoolean()).isTrue();
        assertThat(status.path("strikes").asInt()).isEqualTo(3);
        assertThat(status.path("maxStrikes").asInt()).isEqualTo(3);
        assertThat(publiclyListed(seller, itemId, viewer)).isFalse();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM inventory_item WHERE id = ?::uuid AND"
                                        + " deleted_at IS NULL",
                                itemId))
                .as("never deleted")
                .isEqualTo(1);
        await().atMost(WAIT)
                .until(
                        () ->
                                notificationsOfType(seller, "SYSTEM").stream()
                                        .anyMatch(
                                                notice ->
                                                        "UNRESPONSIVE"
                                                                .equals(
                                                                        notice.path("data")
                                                                                .path("source")
                                                                                .asString())));
        assertThat(auditActions("USER", seller.id().toString())).contains("listings.pause");

        // A second run keeps the pause without pausing again.
        runDelistJob();
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM audit_log WHERE target_type = 'USER' AND"
                                        + " target_id = ? AND action = 'listings.pause'",
                                seller.id().toString()))
                .isEqualTo(1);

        // The owner confirms: listings back, strikes restart; the old conversations no longer
        // count.
        JsonNode resumed =
                callJson(HttpMethod.POST, "/api/v1/me/listings/resume", seller.uid(), null, 200);
        assertThat(resumed.path("paused").asBoolean()).isFalse();
        assertThat(resumed.path("strikes").asInt()).isZero();
        assertThat(publiclyListed(seller, itemId, viewer)).isTrue();
        callJson(HttpMethod.POST, "/api/v1/me/listings/resume", seller.uid(), null, 409);
        runDelistJob();
        Map<String, Object> after = responsiveness(seller);
        assertThat(after.get("strikes")).isEqualTo(0);
        assertThat(after.get("unanswered_conversations_30d")).isEqualTo(3);
        assertThat(after.get("paused_at")).isNull();
        assertThat(publiclyListed(seller, itemId, viewer)).isTrue();
    }

    @Test
    void fewerStrikesBlocksAndCollectorsWithoutListingsAreNotPaused() {
        Collector seller = member("st2-seller");
        Collector quiet = member("st2-quiet");
        publicItem(seller, printing(AZURE), Map.of());
        List<Collector> buyers = new ArrayList<>();
        for (int index = 0; index < 3; index++) {
            Collector buyer = member("st2-buyer" + index);
            buyers.add(buyer);
            String conversationId = conversation(buyer, seller);
            texts(buyer, conversationId, 1);
            backdate(conversationId);
            // The quiet collector has nothing public: counted, never paused.
            String quietConversation = conversation(buyer, quiet);
            texts(buyer, quietConversation, 1);
            backdate(quietConversation);
        }
        // The seller blocked one buyer: that conversation does not count.
        callJson(
                HttpMethod.POST,
                "/api/v1/users/" + buyers.get(0).id() + "/block",
                seller.uid(),
                Map.of(),
                200);

        runDelistJob();
        Map<String, Object> sellerRow = responsiveness(seller);
        assertThat(sellerRow.get("strikes")).isEqualTo(2);
        assertThat(sellerRow.get("paused_at")).isNull();
        Map<String, Object> quietRow = responsiveness(quiet);
        assertThat(quietRow.get("strikes")).isEqualTo(3);
        assertThat(quietRow.get("paused_at")).as("nothing public to pause").isNull();
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/me/listings/status",
                                        seller.uid(),
                                        null,
                                        200)
                                .path("strikes")
                                .asInt())
                .isEqualTo(2);
    }

    /** The conversation's last message waited 4 days (older than 72 h, within 30 days). */
    private void backdate(String conversationId) {
        testUsers.update(
                "UPDATE conversation SET last_message_at = now() - interval '4 days' WHERE id ="
                        + " ?::uuid",
                conversationId);
    }

    private Map<String, Object> responsiveness(Collector collector) {
        return testUsers
                .query(
                        "SELECT strikes, unanswered_conversations_30d, pause_source, paused_at FROM"
                                + " user_responsiveness WHERE user_id = ?",
                        collector.id())
                .get(0);
    }
}
