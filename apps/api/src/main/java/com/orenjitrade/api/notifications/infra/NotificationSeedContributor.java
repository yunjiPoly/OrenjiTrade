package com.orenjitrade.api.notifications.infra;

import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.common.seed.SeedContributor;
import java.sql.Timestamp;
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
 * Seeds a few historical notifications ({@code docs/development/seed-data.md} "Interactions";
 * fictional, local/dev only, stable ids {@code 00000000-0000-4000-9a00-...}): a read welcome notice
 * and a read message notice for collector1, the unread notice of collector1's last message for
 * collector2 (matching the seeded conversation) and an unread freshness warning for collector3's
 * stale binder. Inserted once ({@code ON CONFLICT DO NOTHING}); they are history, so nothing is
 * dispatched. collector2's wishlist match notification comes from the real pipeline ({@code
 * WishlistSeedContributor}).
 */
@Component
public class NotificationSeedContributor implements SeedContributor {

    static final UUID COLLECTOR1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID COLLECTOR2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
    static final UUID COLLECTOR3 = UUID.fromString("00000000-0000-4000-8000-000000000003");
    static final String CONVERSATION = "00000000-0000-4000-8d00-000000000001";
    static final String STALE_BINDER = "00000000-0000-4000-8b00-000000000301";

    private final JdbcClient jdbc;
    private final TimeProvider timeProvider;

    public NotificationSeedContributor(JdbcClient jdbc, TimeProvider timeProvider) {
        this.jdbc = jdbc;
        this.timeProvider = timeProvider;
    }

    @Override
    public String name() {
        return "notifications";
    }

    @Override
    public int order() {
        return ORDER_INTERACTIONS + 30;
    }

    @Override
    @Transactional
    public void seed() {
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        List<Seed> seeds =
                List.of(
                        new Seed(
                                "00000000-0000-4000-9a00-000000000101",
                                COLLECTOR1,
                                "SYSTEM",
                                "Welcome to OrenjiTrade",
                                "Add your cards, publish a binder and collectors nearby will find"
                                        + " you on the map.",
                                "{\"kind\": \"WELCOME\", \"deepLink\": \"/inventory\"}",
                                now.minus(Duration.ofDays(3)),
                                true),
                        new Seed(
                                "00000000-0000-4000-9a00-000000000102",
                                COLLECTOR1,
                                "MESSAGE",
                                "New message from Devon Okafor",
                                "Devon Okafor sent you a message.",
                                "{\"conversationId\": \""
                                        + CONVERSATION
                                        + "\", \"deepLink\": \"/messages/"
                                        + CONVERSATION
                                        + "\"}",
                                now.minus(Duration.ofHours(26)),
                                true),
                        new Seed(
                                "00000000-0000-4000-9a00-000000000201",
                                COLLECTOR2,
                                "MESSAGE",
                                "New message from Maïka Tremblay",
                                "Maïka Tremblay sent you a message.",
                                "{\"conversationId\": \""
                                        + CONVERSATION
                                        + "\", \"deepLink\": \"/messages/"
                                        + CONVERSATION
                                        + "\"}",
                                now.minus(Duration.ofHours(25)),
                                false),
                        new Seed(
                                "00000000-0000-4000-9a00-000000000301",
                                COLLECTOR3,
                                "BINDER_STALE_WARNING",
                                "Confirm your listings are still available",
                                "Your binder \"Vintage Yu-Gi-Oh! singles\" will be hidden from the"
                                        + " map in 6 days unless you confirm it is still"
                                        + " available.",
                                "{\"binderId\": \""
                                        + STALE_BINDER
                                        + "\", \"itemCount\": 0, \"deepLink\":"
                                        + " \"/inventory?binder="
                                        + STALE_BINDER
                                        + "\"}",
                                now.minus(Duration.ofHours(2)),
                                false));
        for (Seed seed : seeds) {
            insert(seed);
        }
    }

    private void insert(Seed seed) {
        if (!isActive(seed.userId())) {
            return;
        }
        @Nullable Timestamp readAt = seed.read() ? Timestamp.from(seed.at()) : null;
        jdbc.sql(
                        """
                        INSERT INTO notification (id, user_id, type, title, body, data, dedup_key,
                                                  in_app, created_at, read_at, seen_at,
                                                  channel_state)
                        VALUES (:id, :userId, :type, :title, :body, CAST(:data AS jsonb),
                                :dedupKey, true, :at, :readAt, :readAt,
                                '{"seed": true}'::jsonb)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", UUID.fromString(seed.id()))
                .param("userId", seed.userId())
                .param("type", seed.type())
                .param("title", seed.title())
                .param("body", seed.body())
                .param("data", seed.data())
                .param("dedupKey", "seed:" + seed.id())
                .param("at", Timestamp.from(seed.at()))
                .param("readAt", readAt, java.sql.Types.TIMESTAMP)
                .update();
    }

    private boolean isActive(UUID userId) {
        return jdbc.sql(
                                "SELECT count(*) FROM user_account WHERE id = :id AND status ="
                                        + " 'ACTIVE'")
                        .param("id", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    private record Seed(
            String id,
            UUID userId,
            String type,
            String title,
            String body,
            String data,
            Instant at,
            boolean read) {}
}
