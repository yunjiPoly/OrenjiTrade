package com.orenjitrade.api.notifications.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** SQL of the {@code push_token} table; used only inside the notifications module. */
@Repository
public class PushTokenRepository {

    private final JdbcClient jdbc;

    public PushTokenRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Registers (or re-registers) a token for the user: a token known for another account moves to
     * this one; an invalidated token becomes valid again.
     */
    public void upsert(UUID userId, String platform, String token, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO push_token (id, user_id, platform, token, created_at, last_seen_at)
                        VALUES (gen_random_uuid(), :userId, :platform, :token, :now, :now)
                        ON CONFLICT (token) DO UPDATE
                           SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
                               last_seen_at = EXCLUDED.last_seen_at, invalid_at = NULL
                        """)
                .param("userId", userId)
                .param("platform", platform)
                .param("token", token)
                .param("now", Timestamp.from(now))
                .update();
    }

    public int delete(UUID userId, String token) {
        return jdbc.sql("DELETE FROM push_token WHERE user_id = :userId AND token = :token")
                .param("userId", userId)
                .param("token", token)
                .update();
    }

    /** Valid tokens of a user, most recently seen first, at most {@code limit}. */
    public List<String> activeTokens(UUID userId, int limit) {
        return jdbc.sql(
                        "SELECT token FROM push_token WHERE user_id = :userId AND invalid_at IS"
                                + " NULL ORDER BY last_seen_at DESC LIMIT :limit")
                .param("userId", userId)
                .param("limit", limit)
                .query(String.class)
                .list();
    }

    public int markInvalid(Collection<String> tokens, Instant now) {
        if (tokens.isEmpty()) {
            return 0;
        }
        return jdbc.sql(
                        "UPDATE push_token SET invalid_at = :now WHERE token IN (:tokens)"
                                + " AND invalid_at IS NULL")
                .param("now", Timestamp.from(now))
                .param("tokens", tokens)
                .update();
    }

    /** Platform and dates of the user's tokens (export), never the token values. */
    public List<Map<String, Object>> summaries(UUID userId) {
        return jdbc.sql(
                        "SELECT platform, created_at, last_seen_at, invalid_at FROM push_token"
                                + " WHERE user_id = :userId ORDER BY created_at")
                .param("userId", userId)
                .query()
                .listOfRows();
    }

    public int deleteByUser(UUID userId) {
        return jdbc.sql("DELETE FROM push_token WHERE user_id = :userId")
                .param("userId", userId)
                .update();
    }
}
