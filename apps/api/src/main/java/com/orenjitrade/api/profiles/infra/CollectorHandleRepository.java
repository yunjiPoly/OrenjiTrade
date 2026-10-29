package com.orenjitrade.api.profiles.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * The handle lookup of the public collector reads ({@code /collectors/{handle}} and every read
 * under it): one query decides whether the handle names a publicly visible account the viewer may
 * reach, so an unknown handle, a suspended, deletion-pending or deleted account and a collector who
 * blocked the viewer take the same path to their {@code 404} (owner decision of 2026-10-28, R13
 * follow-up 7, review fix 1: no extra query, so no timing, tells a block apart). The block is the
 * messaging module's {@code user_block} table, read here as the discovery SQL reads it.
 */
@Repository
public class CollectorHandleRepository {

    private static final String VISIBLE =
            """
            SELECT u.id FROM user_account u
            WHERE lower(u.handle) = :handle
              AND (u.status = 'ACTIVE'
                   OR (u.status = 'SUSPENDED' AND u.suspended_until IS NOT NULL
                       AND u.suspended_until <= :now))
            """;

    /**
     * A collector who blocked the viewer is hidden from them, unless the viewer blocked them too
     * (each of them is then the blocker and keeps the blocker's view).
     */
    private static final String NOT_HIDING_FROM_VIEWER =
            """
              AND (u.id = :viewer OR NOT EXISTS (
                     SELECT 1 FROM user_block b
                     WHERE b.blocker_id = u.id AND b.blocked_id = :viewer
                       AND NOT EXISTS (SELECT 1 FROM user_block r
                                       WHERE r.blocker_id = :viewer AND r.blocked_id = u.id)))
            """;

    private final JdbcClient jdbc;

    public CollectorHandleRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The id of the account holding {@code normalisedHandle} when it is publicly visible at {@code
     * now} (active, or its temporary suspension is over) and, for a signed-in viewer, has not
     * blocked the viewer; empty otherwise.
     */
    public Optional<UUID> visibleId(String normalisedHandle, @Nullable UUID viewerId, Instant now) {
        if (viewerId == null) {
            return jdbc.sql(VISIBLE)
                    .param("handle", normalisedHandle)
                    .param("now", Timestamp.from(now))
                    .query(UUID.class)
                    .optional();
        }
        return jdbc.sql(VISIBLE + NOT_HIDING_FROM_VIEWER)
                .param("handle", normalisedHandle)
                .param("now", Timestamp.from(now))
                .param("viewer", viewerId)
                .query(UUID.class)
                .optional();
    }
}
