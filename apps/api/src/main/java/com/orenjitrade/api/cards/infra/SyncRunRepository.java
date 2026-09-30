package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.SyncRunStatus;
import com.orenjitrade.api.cards.domain.SyncRunView;
import com.orenjitrade.api.cards.domain.provider.SyncMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code catalog_sync_run} access. */
@Repository
public class SyncRunRepository {

    private static final String SELECT =
            """
            SELECT r.id, r.provider, g.slug AS game, r.mode, r.status, r.requested_by, r.created_at,
                   r.started_at, r.finished_at, r.sets_upserted, r.cards_upserted,
                   r.printings_upserted, r.error
              FROM catalog_sync_run r JOIN game g ON g.id = r.game_id
            """;

    private final JdbcClient jdbc;

    public SyncRunRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insertQueued(
            UUID id,
            String provider,
            UUID gameId,
            SyncMode mode,
            @Nullable UUID requestedBy,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO catalog_sync_run (id, provider, game_id, mode, status, requested_by, created_at)
                        VALUES (:id, :provider, :gameId, :mode, 'QUEUED', :requestedBy, :now)
                        """)
                .param("id", id)
                .param("provider", provider)
                .param("gameId", gameId)
                .param("mode", mode.name())
                .param("requestedBy", requestedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** QUEUED → RUNNING; {@code false} when the run was already picked up (idempotency). */
    public boolean markRunning(UUID id, Instant now) {
        return jdbc.sql(
                                "UPDATE catalog_sync_run SET status = 'RUNNING', started_at = :now"
                                        + " WHERE id = :id AND status = 'QUEUED'")
                        .param("id", id)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void markSucceeded(UUID id, int sets, int cards, int printings, Instant now) {
        jdbc.sql(
                        """
                        UPDATE catalog_sync_run
                           SET status = 'SUCCEEDED', finished_at = :now, sets_upserted = :sets,
                               cards_upserted = :cards, printings_upserted = :printings, error = NULL
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("sets", sets)
                .param("cards", cards)
                .param("printings", printings)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void markFailed(UUID id, String error, Instant now) {
        jdbc.sql(
                        "UPDATE catalog_sync_run SET status = 'FAILED', finished_at = :now, error ="
                                + " :error WHERE id = :id")
                .param("id", id)
                .param("error", error)
                .param("now", Timestamp.from(now))
                .update();
    }

    public Optional<SyncRunView> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE r.id = :id")
                .param("id", id)
                .query(SyncRunRepository::map)
                .optional();
    }

    /** Latest successful run of a provider for a game (incremental syncs start there). */
    public Optional<Instant> lastSuccessfulStart(String provider, UUID gameId) {
        return jdbc
                .sql(
                        """
                        SELECT max(started_at) FROM catalog_sync_run
                         WHERE provider = :provider AND game_id = :gameId AND status = 'SUCCEEDED'
                        """)
                .param("provider", provider)
                .param("gameId", gameId)
                .query(Timestamp.class)
                .list()
                .stream()
                .filter(java.util.Objects::nonNull)
                .map(Timestamp::toInstant)
                .findFirst();
    }

    public long count(@Nullable UUID gameId) {
        return jdbc.sql(
                        "SELECT count(*) FROM catalog_sync_run WHERE CAST(:gameId AS uuid) IS NULL"
                                + " OR game_id = CAST(:gameId AS uuid)")
                .param("gameId", gameId, java.sql.Types.OTHER)
                .query(Long.class)
                .single();
    }

    public List<SyncRunView> page(@Nullable UUID gameId, int page, int size) {
        return jdbc.sql(
                        SELECT
                                + " WHERE CAST(:gameId AS uuid) IS NULL OR r.game_id ="
                                + " CAST(:gameId AS uuid)"
                                + " ORDER BY r.created_at DESC, r.id LIMIT :limit OFFSET :offset")
                .param("gameId", gameId, java.sql.Types.OTHER)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query(SyncRunRepository::map)
                .list();
    }

    private static SyncRunView map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp started = rs.getTimestamp("started_at");
        Timestamp finished = rs.getTimestamp("finished_at");
        return new SyncRunView(
                rs.getObject("id", UUID.class),
                rs.getString("provider"),
                rs.getString("game"),
                SyncMode.valueOf(rs.getString("mode")),
                SyncRunStatus.valueOf(rs.getString("status")),
                rs.getObject("requested_by", UUID.class),
                rs.getTimestamp("created_at").toInstant(),
                started == null ? null : started.toInstant(),
                finished == null ? null : finished.toInstant(),
                rs.getInt("sets_upserted"),
                rs.getInt("cards_upserted"),
                rs.getInt("printings_upserted"),
                rs.getString("error"));
    }
}
