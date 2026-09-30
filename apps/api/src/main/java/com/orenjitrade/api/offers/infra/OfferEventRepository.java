package com.orenjitrade.api.offers.infra;

import com.orenjitrade.api.offers.domain.OfferEventRow;
import com.orenjitrade.api.offers.domain.OfferEventType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code offer_event} access (append-only history); used only inside the offers module. */
@Repository
public class OfferEventRepository {

    private static final String COLUMNS =
            "id, offer_id, root_offer_id, actor_id, event, snapshot::text AS snapshot, reason,"
                    + " created_at";

    private final JdbcClient jdbc;

    public OfferEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(
            UUID offerId,
            UUID rootOfferId,
            @Nullable UUID actorId,
            OfferEventType event,
            String snapshotJson,
            @Nullable String reason,
            Instant at) {
        jdbc.sql(
                        """
                        INSERT INTO offer_event (id, offer_id, root_offer_id, actor_id, event,
                            snapshot, reason, created_at)
                        VALUES (:id, :offerId, :rootId, :actorId, :event, CAST(:snapshot AS jsonb),
                            :reason, :at)
                        """)
                .param("id", UUID.randomUUID())
                .param("offerId", offerId)
                .param("rootId", rootOfferId)
                .param("actorId", actorId, Types.OTHER)
                .param("event", event.name())
                .param("snapshot", snapshotJson)
                .param("reason", reason, Types.VARCHAR)
                .param("at", Timestamp.from(at))
                .update();
    }

    /**
     * Records the first view of a proposal by a party ({@code uq_offer_event_viewed}).
     *
     * @return whether this call recorded it
     */
    public boolean insertViewedIfAbsent(
            UUID offerId, UUID rootOfferId, UUID actorId, String snapshotJson, Instant at) {
        return jdbc.sql(
                                """
                                INSERT INTO offer_event (id, offer_id, root_offer_id, actor_id,
                                    event, snapshot, created_at)
                                VALUES (:id, :offerId, :rootId, :actorId, 'VIEWED',
                                    CAST(:snapshot AS jsonb), :at)
                                ON CONFLICT (offer_id, actor_id) WHERE event = 'VIEWED'
                                DO NOTHING
                                """)
                        .param("id", UUID.randomUUID())
                        .param("offerId", offerId)
                        .param("rootId", rootOfferId)
                        .param("actorId", actorId)
                        .param("snapshot", snapshotJson)
                        .param("at", Timestamp.from(at))
                        .update()
                > 0;
    }

    /** The whole history of a chain, oldest first. */
    public List<OfferEventRow> byRoot(UUID rootOfferId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM offer_event WHERE root_offer_id = :rootId"
                                + " ORDER BY created_at, seq")
                .param("rootId", rootOfferId)
                .query(OfferEventRepository::map)
                .list();
    }

    /** Erases the reasons a (deleted) collector gave; returns the rows changed. */
    public int eraseReasonsOf(UUID actorId) {
        return jdbc.sql(
                        "UPDATE offer_event SET reason = NULL WHERE actor_id = :id AND reason IS"
                                + " NOT NULL")
                .param("id", actorId)
                .update();
    }

    /**
     * Erases the notes that snapshots of a (deleted) collector's proposals repeat; returns the rows
     * changed.
     */
    public int eraseSnapshotMessagesOf(UUID actorId) {
        return jdbc.sql(
                        "UPDATE offer_event SET snapshot = snapshot - 'message' WHERE actor_id ="
                                + " :id AND event IN ('CREATED', 'COUNTERED')")
                .param("id", actorId)
                .update();
    }

    static OfferEventRow map(ResultSet rs, int rowNum) throws SQLException {
        return new OfferEventRow(
                rs.getObject("id", UUID.class),
                rs.getObject("offer_id", UUID.class),
                rs.getObject("root_offer_id", UUID.class),
                rs.getObject("actor_id", UUID.class),
                OfferEventType.valueOf(rs.getString("event")),
                rs.getString("snapshot"),
                rs.getString("reason"),
                rs.getTimestamp("created_at").toInstant());
    }
}
