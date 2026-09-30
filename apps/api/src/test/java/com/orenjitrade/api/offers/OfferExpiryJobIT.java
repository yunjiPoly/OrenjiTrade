package com.orenjitrade.api.offers;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 8 hourly {@code offers-expire} job: live OPEN and COUNTERED proposals past their expiry
 * become EXPIRED (history entry without actor, OFFER_EXPIRED for both parties, a job run);
 * superseded proposals and future expiries are left alone; expired offers cannot be acted on.
 */
class OfferExpiryJobIT extends AbstractOffersIT {

    @Test
    void expiresLiveProposalsPastTheirExpiryOnly() {
        Collector seller = member("ex-seller");
        Collector buyer = member("ex-buyer");
        String first = listing(seller, "SALE", 1);
        String second = listing(seller, "SALE", 1);
        String third = listing(seller, "SALE", 1);

        String open = makeOffer(buyer, cash(first, "10.00"), 201).path("id").asString();
        String root = makeOffer(buyer, cash(second, "20.00"), 201).path("id").asString();
        String counter =
                act(seller, root, "counter", counterCash("25.00"), 200).path("id").asString();
        Map<String, Object> later = cash(third, "30.00");
        later.put("expiresInHours", 168);
        String future = makeOffer(buyer, later, 201).path("id").asString();
        expire(open);
        expire(root);
        expire(counter);

        JsonNode result = runExpiryJob();
        assertThat(result.path("expired").asInt()).isGreaterThanOrEqualTo(2);

        JsonNode expired = offer(seller, open, 200);
        assertThat(expired.path("status").asString()).isEqualTo("EXPIRED");
        assertThat(allowed(expired)).isEmpty();
        JsonNode entry = expired.path("history").get(expired.path("history").size() - 1);
        assertThat(entry.path("event").asString()).isEqualTo("EXPIRED");
        assertThat(entry.path("actorRole").isNull()).isTrue();
        assertThat(offer(buyer, counter, 200).path("status").asString()).isEqualTo("EXPIRED");
        JsonNode superseded = offer(buyer, root, 200);
        assertThat(superseded.path("status").asString())
                .as("a superseded proposal keeps its status")
                .isEqualTo("COUNTERED");
        assertThat(superseded.path("superseded").asBoolean()).isTrue();
        assertThat(offer(buyer, future, 200).path("status").asString()).isEqualTo("OPEN");

        assertThat(act(seller, open, "accept", null, 409).path("errorCode").asString())
                .isEqualTo("INVALID_STATE_TRANSITION");
        assertThat(act(buyer, counter, "accept", null, 409).path("currentStatus").asString())
                .isEqualTo("EXPIRED");
        assertThat(act(buyer, open, "cancel", null, 409).path("errorCode").asString())
                .isEqualTo("INVALID_STATE_TRANSITION");
        // The negotiation is closed: a new offer on the same card is welcome again.
        makeOffer(buyer, cash(first, "12.00"), 201);

        JsonNode notice = awaitNotification(buyer, "OFFER_EXPIRED");
        assertThat(notice.path("data").path("deepLink").asString()).startsWith("/offers/");
        awaitNotification(seller, "OFFER_EXPIRED");
        assertThat(runExpiryJob().path("expired").asInt())
                .as("nothing left for these proposals")
                .isGreaterThanOrEqualTo(0);
        assertThat(offer(buyer, future, 200).path("status").asString()).isEqualTo("OPEN");

        List<Map<String, Object>> runs = testUsers.jobRuns("offers-expire");
        assertThat(runs).isNotEmpty();
        assertThat(runs.get(0).get("status")).isEqualTo("SUCCEEDED");
    }

    @Test
    void theJobNeedsServiceAuthentication() {
        String member = uniqueUid("ex-member");
        provisionCompliant(member);
        assertThat(
                        call(HttpMethod.POST, "/internal/jobs/offers-expire", null, null)
                                .getStatus()
                                .value())
                .isIn(401, 403);
        assertThat(
                        call(HttpMethod.POST, "/internal/jobs/offers-expire", member, null)
                                .getStatus()
                                .value())
                .isIn(401, 403);
    }
}
