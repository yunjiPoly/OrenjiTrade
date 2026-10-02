package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.cards.domain.CatalogImportReport;
import com.orenjitrade.api.cards.domain.ImageMode;
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
import tools.jackson.databind.json.JsonMapper;

/** {@code catalog_sync_run} access. */
@Repository
public class SyncRunRepository {

    private static final String SELECT =
            """
            SELECT r.id, r.provider, g.slug AS game, r.mode, r.status, r.requested_by, r.created_at,
                   r.started_at, r.finished_at, r.sets_upserted, r.cards_upserted,
                   r.printings_upserted, r.error, r.image_mode, r.image_limit,
                   r.provider_db_version, r.phase, r.report::text AS report
              FROM catalog_sync_run r JOIN game g ON g.id = r.game_id
            """;

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;

    public SyncRunRepository(JdbcClient jdbc, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
    }

    public void insertQueued(
            UUID id,
            String provider,
            UUID gameId,
            SyncMode mode,
            @Nullable UUID requestedBy,
            Instant now) {
        insertQueued(id, provider, gameId, mode, requestedBy, now, ImageMode.NONE, null);
    }

    public void insertQueued(
            UUID id,
            String provider,
            UUID gameId,
            SyncMode mode,
            @Nullable UUID requestedBy,
            Instant now,
            ImageMode imageMode,
            @Nullable Integer imageLimit) {
        jdbc.sql(
                        """
                        INSERT INTO catalog_sync_run (id, provider, game_id, mode, status,
                            requested_by, created_at, image_mode, image_limit)
                        VALUES (:id, :provider, :gameId, :mode, 'QUEUED', :requestedBy, :now,
                            :imageMode, :imageLimit)
                        """)
                .param("id", id)
                .param("provider", provider)
                .param("gameId", gameId)
                .param("mode", mode.name())
                .param("requestedBy", requestedBy)
                .param("now", Timestamp.from(now))
                .param("imageMode", imageMode.name())
                .param(
                        "imageLimit",
                        imageMode == ImageMode.LIMIT ? imageLimit : null,
                        java.sql.Types.INTEGER)
                .update();
    }

    /** QUEUED → RUNNING; {@code false} when the run was already picked up (idempotency). */
    public boolean markRunning(UUID id, Instant now) {
        return jdbc.sql(
                                "UPDATE catalog_sync_run SET status = 'RUNNING', started_at = :now,"
                                        + " phase = 'FETCHING' WHERE id = :id AND status ="
                                        + " 'QUEUED'")
                        .param("id", id)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    /** A QUEUED run of the game created after {@code since}. */
    public Optional<UUID> queuedRun(UUID gameId, Instant since) {
        return jdbc.sql(
                        """
                        SELECT id FROM catalog_sync_run
                         WHERE game_id = :gameId AND status = 'QUEUED' AND created_at > :since
                         ORDER BY created_at
                         LIMIT 1
                        """)
                .param("gameId", gameId)
                .param("since", Timestamp.from(since))
                .query(UUID.class)
                .optional();
    }

    /** Marks the game's other RUNNING runs FAILED: their process stopped during the import. */
    public int failInterrupted(UUID gameId, UUID currentRunId, Instant now) {
        return jdbc.sql(
                        """
                        UPDATE catalog_sync_run
                           SET status = 'FAILED', finished_at = :now,
                               error = 'Interrupted: the API stopped during the import'
                         WHERE game_id = :gameId AND status = 'RUNNING' AND id <> :current
                        """)
                .param("gameId", gameId)
                .param("current", currentRunId)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Progress: phase, provider version and the report so far. */
    public void markProgress(
            UUID id,
            String phase,
            @Nullable String providerDbVersion,
            @Nullable CatalogImportReport report) {
        jdbc.sql(
                        """
                        UPDATE catalog_sync_run
                           SET phase = :phase,
                               provider_db_version = coalesce(:version, provider_db_version),
                               report = coalesce(CAST(:report AS jsonb), report)
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("phase", phase)
                .param("version", providerDbVersion, java.sql.Types.VARCHAR)
                .param("report", json(report), java.sql.Types.VARCHAR)
                .update();
    }

    public void markSucceeded(UUID id, int sets, int cards, int printings, Instant now) {
        markSucceeded(id, sets, cards, printings, now, null);
    }

    public void markSucceeded(
            UUID id,
            int sets,
            int cards,
            int printings,
            Instant now,
            @Nullable CatalogImportReport report) {
        jdbc.sql(
                        """
                        UPDATE catalog_sync_run
                           SET status = 'SUCCEEDED', finished_at = :now, sets_upserted = :sets,
                               cards_upserted = :cards, printings_upserted = :printings, error = NULL,
                               phase = 'DONE', report = coalesce(CAST(:report AS jsonb), report)
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("sets", sets)
                .param("cards", cards)
                .param("printings", printings)
                .param("now", Timestamp.from(now))
                .param("report", json(report), java.sql.Types.VARCHAR)
                .update();
    }

    public void markFailed(UUID id, String error, Instant now) {
        markFailed(id, error, now, null);
    }

    public void markFailed(
            UUID id, String error, Instant now, @Nullable CatalogImportReport report) {
        jdbc.sql(
                        """
                        UPDATE catalog_sync_run
                           SET status = 'FAILED', finished_at = :now, error = :error,
                               report = coalesce(CAST(:report AS jsonb), report)
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("error", error.length() > 1000 ? error.substring(0, 1000) : error)
                .param("now", Timestamp.from(now))
                .param("report", json(report), java.sql.Types.VARCHAR)
                .update();
    }

    public Optional<SyncRunView> find(UUID id) {
        return jdbc.sql(SELECT + " WHERE r.id = :id").param("id", id).query(this::map).optional();
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
                .query(this::map)
                .list();
    }

    private @Nullable String json(@Nullable CatalogImportReport report) {
        return report == null ? null : jsonMapper.writeValueAsString(report);
    }

    private SyncRunView map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp started = rs.getTimestamp("started_at");
        Timestamp finished = rs.getTimestamp("finished_at");
        int limit = rs.getInt("image_limit");
        boolean limitNull = rs.wasNull();
        String report = rs.getString("report");
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
                rs.getString("error"),
                ImageMode.valueOf(rs.getString("image_mode")),
                limitNull ? null : limit,
                rs.getString("provider_db_version"),
                rs.getString("phase"),
                report == null ? null : jsonMapper.readValue(report, CatalogImportReport.class));
    }
}
