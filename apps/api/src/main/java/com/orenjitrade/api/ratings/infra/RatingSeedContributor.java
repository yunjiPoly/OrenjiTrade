package com.orenjitrade.api.ratings.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import com.orenjitrade.api.ratings.domain.InteractionKind;
import com.orenjitrade.api.ratings.domain.RatingScores;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds interactions, ratings and a reference ({@code docs/development/seed-data.md}
 * "Interactions"; fictional, local/dev only, stable ids {@code 00000000-0000-4000-9b00-...}): the
 * seeded conversation of collector1 and collector2 qualifies (3 messages each), a completed trade
 * between them (trade id reserved for the Phase 8 seed) rated both ways, an accepted offer from
 * collector5 to collector1 (offer id reserved for Phase 8) rated by collector5, and collector2's
 * reference for collector1. The conversation interaction stays unrated so both can try the rating
 * flow locally. Inserted once (unique keys); nothing is notified.
 */
@Component
public class RatingSeedContributor implements SeedContributor {

    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID COLLECTOR5 = UUID.fromString("00000000-0000-4000-8000-000000000005");
    static final UUID CONVERSATION = UUID.fromString("00000000-0000-4000-8d00-000000000001");
    static final UUID TRADE_1_2 = UUID.fromString("00000000-0000-4000-9d00-000000000001");
    static final UUID OFFER_5_1 = UUID.fromString("00000000-0000-4000-9c00-000000000002");

    static final UUID INTERACTION_CONVERSATION =
            UUID.fromString("00000000-0000-4000-9b00-000000000001");
    static final UUID INTERACTION_TRADE = UUID.fromString("00000000-0000-4000-9b00-000000000002");
    static final UUID INTERACTION_OFFER = UUID.fromString("00000000-0000-4000-9b00-000000000003");

    private final JdbcClient jdbc;
    private final InteractionRepository interactions;
    private final RatingRepository ratings;
    private final ReferenceRepository references;
    private final TimeProvider timeProvider;

    public RatingSeedContributor(
            JdbcClient jdbc,
            InteractionRepository interactions,
            RatingRepository ratings,
            ReferenceRepository references,
            TimeProvider timeProvider) {
        this.jdbc = jdbc;
        this.interactions = interactions;
        this.ratings = ratings;
        this.references = references;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "ratings";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 40;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        if (isActive(COLLECTOR1) && isActive(COLLECTOR2)) {
            if (conversationExists()) {
                interaction(
                        INTERACTION_CONVERSATION,
                        InteractionKind.CONVERSATION_QUALIFIED,
                        COLLECTOR1,
                        COLLECTOR2,
                        CONVERSATION,
                        now.minus(Duration.ofHours(24)));
            }
            interaction(
                    INTERACTION_TRADE,
                    InteractionKind.TRADE,
                    COLLECTOR1,
                    COLLECTOR2,
                    TRADE_1_2,
                    now.minus(Duration.ofHours(20)));
            rating(
                    "00000000-0000-4000-9b00-000000000101",
                    INTERACTION_TRADE,
                    COLLECTOR2,
                    COLLECTOR1,
                    new RatingScores(5, 5, 5, null, 5),
                    "Smooth trade at the café on Mont-Royal, cards exactly as described.",
                    now.minus(Duration.ofHours(18)));
            rating(
                    "00000000-0000-4000-9b00-000000000102",
                    INTERACTION_TRADE,
                    COLLECTOR1,
                    COLLECTOR2,
                    new RatingScores(5, 4, null, null, 5),
                    "Friendly and right on time. Would trade again.",
                    now.minus(Duration.ofHours(17)));
            references.insertIfAbsent(
                    UUID.fromString("00000000-0000-4000-9b00-000000000201"),
                    COLLECTOR2,
                    COLLECTOR1,
                    "Maïka knows her Yu-Gi-Oh! singles and keeps her binders up to date.",
                    now.minus(Duration.ofHours(16)));
        }
        if (isActive(COLLECTOR1) && isActive(COLLECTOR5)) {
            interaction(
                    INTERACTION_OFFER,
                    InteractionKind.OFFER_ACCEPTED,
                    COLLECTOR5,
                    COLLECTOR1,
                    OFFER_5_1,
                    now.minus(Duration.ofDays(3)));
            rating(
                    "00000000-0000-4000-9b00-000000000103",
                    INTERACTION_OFFER,
                    COLLECTOR5,
                    COLLECTOR1,
                    new RatingScores(4, 4, null, 4, null),
                    "Quick answers and a well-packed shipment.",
                    now.minus(Duration.ofDays(2)));
        }
        for (UUID collector : List.of(COLLECTOR1, COLLECTOR2)) {
            ratings.refreshSummary(collector, now);
        }
    }

    private void interaction(
            UUID id, InteractionKind kind, UUID one, UUID other, UUID subjectId, Instant at) {
        interactions.insertIfAbsent(id, kind, one, other, kind.subjectType(), subjectId, at);
    }

    private void rating(
            String id,
            UUID interactionId,
            UUID rater,
            UUID ratee,
            RatingScores scores,
            @Nullable String comment,
            Instant at) {
        if (interactions.find(interactionId).isEmpty()) {
            return;
        }
        ratings.insertIfAbsent(
                UUID.fromString(id), interactionId, rater, ratee, scores, comment, at);
    }

    private boolean conversationExists() {
        return jdbc.sql("SELECT count(*) FROM conversation WHERE id = :id")
                        .param("id", CONVERSATION)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private boolean isActive(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM user_account WHERE id = :id AND status = 'ACTIVE'")
                        .param("id", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }
}
