package com.orenjitrade.api.ratings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.orenjitrade.api.admin.AbstractPhase7IT;
import com.orenjitrade.api.auth.domain.Role;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.InteractionSubjectType;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import tools.jackson.databind.JsonNode;

/**
 * Phase 7 ratings and references: eligibility (qualified conversations, accepted offers, trades),
 * 403 RATING_NOT_ELIGIBLE for unrelated collectors, 409 ALREADY_RATED, the 14-day edit window, the
 * rating summary on the profile, RATING_RECEIVED notifications, references and moderator hide /
 * unhide (audited).
 */
class RatingEligibilityIT extends AbstractPhase7IT {

    @Test
    void unrelatedCollectorsCannotRate() {
        Collector alice = member("rt-alice");
        Collector bob = member("rt-bob");
        Collector carol = member("rt-carol");
        Collector dave = member("rt-dave");

        JsonNode eligibility =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + bob.id(),
                        alice.uid(),
                        null,
                        200);
        assertThat(eligibility.path("eligible").asBoolean()).isFalse();
        assertThat(eligibility.path("interactions")).isEmpty();

        JsonNode unknown =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/ratings",
                        alice.uid(),
                        rating(UUID.randomUUID(), 5, null),
                        403);
        assertThat(unknown.path("errorCode").asString()).isEqualTo("RATING_NOT_ELIGIBLE");

        // Somebody else's interaction does not make Alice eligible either.
        UUID theirs = interaction(carol, dave, InteractionKind.OFFER_ACCEPTED);
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/ratings",
                                        alice.uid(),
                                        rating(theirs, 1, "I never met them"),
                                        403)
                                .path("errorCode")
                                .asString())
                .isEqualTo("RATING_NOT_ELIGIBLE");
        assertThat(testUsers.count("SELECT count(*) FROM rating WHERE rater_id = ?", alice.id()))
                .isZero();

        // No reference without an interaction; never for oneself.
        assertThat(
                        callJson(
                                        HttpMethod.POST,
                                        "/api/v1/references",
                                        alice.uid(),
                                        Map.of("subjectId", bob.id().toString(), "body", "Great"),
                                        403)
                                .path("errorCode")
                                .asString())
                .isEqualTo("RATING_NOT_ELIGIBLE");
        callJson(
                HttpMethod.GET,
                "/api/v1/ratings/eligibility?userId=" + alice.id(),
                alice.uid(),
                null,
                400);
        callJson(HttpMethod.GET, "/api/v1/ratings/eligibility?userId=" + bob.id(), null, null, 401);
    }

    @Test
    void aConversationQualifiesWithThreeMessagesFromEachSide() {
        Collector alice = member("rt-conv-a");
        Collector bob = member("rt-conv-b");
        String conversationId = conversation(alice, bob);
        texts(alice, conversationId, 3);
        texts(bob, conversationId, 2);
        awaitEventsProcessed(conversationId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE subject_id = ?::uuid",
                                conversationId))
                .as("2 messages from Bob do not qualify the conversation")
                .isZero();

        texts(bob, conversationId, 1);
        UUID interactionId = awaitQualified(conversationId);

        JsonNode eligibility =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + bob.id(),
                        alice.uid(),
                        null,
                        200);
        assertThat(eligibility.path("eligible").asBoolean()).isTrue();
        assertThat(eligibility.path("interactions")).hasSize(1);
        JsonNode interaction = eligibility.path("interactions").get(0);
        assertThat(interaction.path("id").asString()).isEqualTo(interactionId.toString());
        assertThat(interaction.path("kind").asString()).isEqualTo("CONVERSATION_QUALIFIED");
        assertThat(interaction.path("alreadyRated").asBoolean()).isFalse();

        // More messages never record a second interaction.
        texts(alice, conversationId, 1);
        awaitEventsProcessed(conversationId);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM interaction WHERE subject_id = ?::uuid",
                                conversationId))
                .isEqualTo(1);
    }

    @Test
    void eligibleCollectorsRateOnceAndEditWithinFourteenDays() {
        Collector alice = member("rt-rate-a");
        Collector bob = member("rt-rate-b");
        UUID interactionId = interaction(alice, bob, InteractionKind.TRADE);
        assertThat(
                        interactionService
                                .record(
                                        InteractionKind.TRADE,
                                        bob.id(),
                                        alice.id(),
                                        InteractionSubjectType.TRADE,
                                        (UUID)
                                                testUsers
                                                        .query(
                                                                "SELECT subject_id FROM interaction"
                                                                        + " WHERE id = ?",
                                                                interactionId)
                                                        .get(0)
                                                        .get("subject_id"))
                                .id())
                .as("recording the same trade again is idempotent")
                .isEqualTo(interactionId);

        // Validation first.
        callJson(
                HttpMethod.POST,
                "/api/v1/ratings",
                alice.uid(),
                rating(interactionId, 6, null),
                400);
        JsonNode banned =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/ratings",
                        alice.uid(),
                        rating(interactionId, 5, "What a zorblax trade"),
                        400);
        assertThat(banned.path("errors").toString()).contains("comment");

        Map<String, Object> body = rating(interactionId, 4, "Cards exactly as described.");
        body.put("communication", 5);
        body.put("conditionAccuracy", 4);
        JsonNode created = callJson(HttpMethod.POST, "/api/v1/ratings", alice.uid(), body, 201);
        String ratingId = created.path("id").asString();
        assertThat(created.path("overall").asInt()).isEqualTo(4);
        assertThat(created.path("breakdown").path("communication").asInt()).isEqualTo(5);
        assertThat(created.path("rater").path("handle").asString()).isEqualTo(alice.handle());
        assertThat(created.path("interactionKind").asString()).isEqualTo("TRADE");
        assertThat(created.path("editableUntil").asString()).isNotBlank();

        JsonNode duplicate =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/ratings",
                        alice.uid(),
                        rating(interactionId, 5, null),
                        409);
        assertThat(duplicate.path("errorCode").asString()).isEqualTo("ALREADY_RATED");
        assertThat(duplicate.path("ratingId").asString()).isEqualTo(ratingId);

        JsonNode eligibility =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/ratings/eligibility?userId=" + bob.id(),
                        alice.uid(),
                        null,
                        200);
        assertThat(eligibility.path("eligible").asBoolean()).isFalse();
        assertThat(eligibility.path("interactions").get(0).path("alreadyRated").asBoolean())
                .isTrue();
        // Bob may still rate Alice for the same trade.
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/ratings/eligibility?userId=" + alice.id(),
                                        bob.uid(),
                                        null,
                                        200)
                                .path("eligible")
                                .asBoolean())
                .isTrue();

        // The rated collector is notified and the summary feeds the profile.
        await().atMost(WAIT).until(() -> !notificationsOfType(bob, "RATING_RECEIVED").isEmpty());
        JsonNode notification = notificationsOfType(bob, "RATING_RECEIVED").get(0);
        assertThat(notification.path("data").path("ratingId").asString()).isEqualTo(ratingId);
        assertThat(notification.toString()).doesNotContain("Cards exactly as described");

        JsonNode ratings =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + bob.handle() + "/ratings",
                        alice.uid(),
                        null,
                        200);
        assertThat(ratings.path("items")).hasSize(1);
        assertThat(ratings.path("items").get(0).path("comment").asString())
                .isEqualTo("Cards exactly as described.");
        assertThat(ratings.path("summary").path("count").asInt()).isEqualTo(1);
        assertThat(ratings.path("summary").path("average").asDouble()).isEqualTo(4.0);
        assertThat(ratings.path("summary").path("communication").asDouble()).isEqualTo(5.0);
        JsonNode profile =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + bob.handle(),
                        alice.uid(),
                        null,
                        200);
        assertThat(profile.path("rating").path("count").asInt()).isEqualTo(1);
        assertThat(profile.path("rating").path("average").asDouble()).isEqualTo(4.0);

        // Edits within the window update the summary; other users cannot edit.
        Map<String, Object> edit = new LinkedHashMap<>();
        edit.put("overall", 2);
        edit.put("comment", "Changed my mind after a second look.");
        JsonNode edited =
                callJson(HttpMethod.PUT, "/api/v1/ratings/" + ratingId, alice.uid(), edit, 200);
        assertThat(edited.path("overall").asInt()).isEqualTo(2);
        assertThat(edited.path("breakdown").path("communication").isNull()).isTrue();
        callJson(HttpMethod.PUT, "/api/v1/ratings/" + ratingId, bob.uid(), edit, 404);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + bob.handle() + "/ratings",
                                        alice.uid(),
                                        null,
                                        200)
                                .path("summary")
                                .path("average")
                                .asDouble())
                .isEqualTo(2.0);
        assertThat(
                        testUsers.count(
                                "SELECT count(*) FROM notification WHERE user_id = ? AND type ="
                                        + " 'RATING_RECEIVED'",
                                bob.id()))
                .as("edits do not notify again")
                .isEqualTo(1);

        // After 14 days the rating is frozen.
        testUsers.update(
                "UPDATE rating SET created_at = now() - interval '15 days' WHERE id = ?::uuid",
                ratingId);
        JsonNode closed =
                callJson(HttpMethod.PUT, "/api/v1/ratings/" + ratingId, alice.uid(), edit, 409);
        assertThat(closed.path("errorCode").asString()).isEqualTo("RATING_EDIT_WINDOW_CLOSED");
        assertThat(closed.path("editableUntil").asString()).isNotBlank();
    }

    @Test
    void referencesNeedAnInteractionAndAreUniquePerAuthor() {
        Collector alice = member("rt-ref-a");
        Collector bob = member("rt-ref-b");
        Collector carol = member("rt-ref-c");
        interaction(alice, bob, InteractionKind.OFFER_ACCEPTED);

        JsonNode reference =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/references",
                        alice.uid(),
                        Map.of(
                                "subjectId",
                                bob.id().toString(),
                                "body",
                                "Bob answers fast and packs cards with care."),
                        201);
        assertThat(reference.path("author").path("handle").asString()).isEqualTo(alice.handle());
        callJson(
                HttpMethod.POST,
                "/api/v1/references",
                alice.uid(),
                Map.of("subjectId", bob.id().toString(), "body", "Second one"),
                409);
        callJson(
                HttpMethod.POST,
                "/api/v1/references",
                carol.uid(),
                Map.of("subjectId", bob.id().toString(), "body", "Never met"),
                403);
        callJson(
                HttpMethod.POST,
                "/api/v1/references",
                alice.uid(),
                Map.of("subjectId", bob.id().toString(), "body", "x".repeat(401)),
                400);

        JsonNode list =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + bob.handle() + "/references",
                        carol.uid(),
                        null,
                        200);
        assertThat(list.path("items")).hasSize(1);
        assertThat(list.path("items").get(0).path("body").asString())
                .isEqualTo("Bob answers fast and packs cards with care.");

        // Moderators hide and unhide references (audited).
        String moderator = staff("rt-ref-mod", Role.MODERATOR);
        String referenceId = reference.path("id").asString();
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/references/" + referenceId + "/hide",
                moderator,
                Map.of("reason", "Off-topic"),
                200);
        assertThat(
                        callJson(
                                        HttpMethod.GET,
                                        "/api/v1/collectors/" + bob.handle() + "/references",
                                        carol.uid(),
                                        null,
                                        200)
                                .path("items"))
                .isEmpty();
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/references/" + referenceId + "/unhide",
                moderator,
                null,
                200);
        assertThat(auditActions("REFERENCE", referenceId))
                .containsExactly("reference.hide", "reference.unhide");
    }

    @Test
    void moderatorsHideAndUnhideRatings() {
        Collector alice = member("rt-hide-a");
        Collector bob = member("rt-hide-b");
        Collector carol = member("rt-hide-c");
        UUID trade = interaction(alice, bob, InteractionKind.TRADE);
        UUID offer = interaction(carol, bob, InteractionKind.OFFER_ACCEPTED);
        String first =
                callJson(
                                HttpMethod.POST,
                                "/api/v1/ratings",
                                alice.uid(),
                                rating(trade, 5, "Top"),
                                201)
                        .path("id")
                        .asString();
        callJson(HttpMethod.POST, "/api/v1/ratings", carol.uid(), rating(offer, 1, "Rude"), 201);
        assertThat(summaryOf(bob, alice).path("count").asInt()).isEqualTo(2);
        assertThat(summaryOf(bob, alice).path("average").asDouble()).isEqualTo(3.0);

        String moderator = staff("rt-hide-mod", Role.MODERATOR);
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/ratings/" + first + "/hide",
                bob.uid(),
                Map.of("reason", "x"),
                403);
        JsonNode hidden =
                callJson(
                        HttpMethod.POST,
                        "/api/v1/admin/ratings/" + first + "/hide",
                        moderator,
                        Map.of("reason", "Rating left for another collector"),
                        200);
        assertThat(hidden.path("moderationState").asString()).isEqualTo("HIDDEN");
        assertThat(hidden.path("hiddenReason").asString())
                .isEqualTo("Rating left for another collector");
        callJson(
                HttpMethod.POST,
                "/api/v1/admin/ratings/" + first + "/hide",
                moderator,
                Map.of("reason", "again"),
                409);
        JsonNode summary = summaryOf(bob, alice);
        assertThat(summary.path("count").asInt()).isEqualTo(1);
        assertThat(summary.path("average").asDouble()).isEqualTo(1.0);
        JsonNode listed =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + bob.handle() + "/ratings",
                        alice.uid(),
                        null,
                        200);
        assertThat(listed.path("items")).hasSize(1);
        assertThat(listed.toString()).doesNotContain(first);

        JsonNode adminList =
                callJson(
                        HttpMethod.GET,
                        "/api/v1/admin/ratings?rateeId=" + bob.id() + "&state=HIDDEN",
                        moderator,
                        null,
                        200);
        assertThat(adminList.path("totalItems").asLong()).isEqualTo(1);

        callJson(
                HttpMethod.POST,
                "/api/v1/admin/ratings/" + first + "/unhide",
                moderator,
                null,
                200);
        assertThat(summaryOf(bob, alice).path("count").asInt()).isEqualTo(2);
        List<Map<String, Object>> audit = auditRows("RATING", first);
        assertThat(audit)
                .extracting(row -> row.get("action"))
                .containsExactly("rating.hide", "rating.unhide");
        assertThat((String) audit.get(0).get("details"))
                .contains("Rating left for another collector");
    }

    private JsonNode summaryOf(Collector ratee, Collector viewer) {
        return callJson(
                        HttpMethod.GET,
                        "/api/v1/collectors/" + ratee.handle() + "/ratings",
                        viewer.uid(),
                        null,
                        200)
                .path("summary");
    }
}
