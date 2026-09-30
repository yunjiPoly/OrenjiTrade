package com.orenjitrade.api.billing.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.OptionalLong;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code usage_counter}: persisted consumption per user, limit key and window start. */
@Repository
public class UsageCounterRepository {

    private final JdbcClient jdbc;

    public UsageCounterRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public long count(UUID userId, String limitKey, Instant windowStart) {
        return jdbc.sql(
                        """
                        SELECT count FROM usage_counter
                         WHERE user_id = :userId AND limit_key = :key AND window_start = :windowStart
                        """)
                .param("userId", userId)
                .param("key", limitKey)
                .param("windowStart", Timestamp.from(windowStart))
                .query(Long.class)
                .optional()
                .orElse(0L);
    }

    /**
     * Atomically adds one to the counter unless that would exceed {@code max} ({@code null} =
     * unlimited). Concurrent calls serialise on the row, so the counter can never pass the limit.
     *
     * @return the new count, or empty when the limit was already reached
     */
    public OptionalLong incrementIfBelow(
            UUID userId, String limitKey, Instant windowStart, @Nullable Integer max, Instant now) {
        if (max != null && max <= 0) {
            return OptionalLong.empty();
        }
        return jdbc.sql(
                        """
                        INSERT INTO usage_counter (user_id, limit_key, window_start, count, updated_at)
                        VALUES (:userId, :key, :windowStart, 1, :now)
                        ON CONFLICT (user_id, limit_key, window_start) DO UPDATE
                           SET count = usage_counter.count + 1, updated_at = EXCLUDED.updated_at
                         WHERE CAST(:max AS integer) IS NULL OR usage_counter.count < CAST(:max AS integer)
                        RETURNING count
                        """)
                .param("userId", userId)
                .param("key", limitKey)
                .param("windowStart", Timestamp.from(windowStart))
                .param("now", Timestamp.from(now))
                .param("max", max, java.sql.Types.INTEGER)
                .query(Long.class)
                .optional()
                .map(OptionalLong::of)
                .orElse(OptionalLong.empty());
    }
}
