package com.orenjitrade.api.trades.infra;

import com.orenjitrade.api.trades.domain.TradeEventRow;
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

/** {@code trade_event} access (append-only timeline); used only inside the trades module. */
@Repository
public class TradeEventRepository {

    private final JdbcClient jdbc;

    public TradeEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public UUID insert(
            UUID tradeId, @Nullable UUID actorId, String event, String detailsJson, Instant at) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO trade_event (id, trade_id, actor_id, event, details, created_at)
                        VALUES (:id, :tradeId, :actorId, :event, CAST(:details AS jsonb), :at)
                        """)
                .param("id", id)
                .param("tradeId", tradeId)
                .param("actorId", actorId, Types.OTHER)
                .param("event", event)
                .param("details", detailsJson)
                .param("at", Timestamp.from(at))
                .update();
        return id;
    }

    /** The timeline of a trade, oldest first. */
    public List<TradeEventRow> byTrade(UUID tradeId) {
        return jdbc.sql(
                        "SELECT id, trade_id, actor_id, event, details::text AS details, created_at"
                                + " FROM trade_event WHERE trade_id = :id ORDER BY created_at, seq")
                .param("id", tradeId)
                .query(TradeEventRepository::map)
                .list();
    }

    /** Erases the reasons a (deleted) collector gave; returns the rows changed. */
    public int eraseReasonsOf(UUID actorId) {
        return jdbc.sql("UPDATE trade_event SET details = details - 'reason' WHERE actor_id = :id")
                .param("id", actorId)
                .update();
    }

    static TradeEventRow map(ResultSet rs, int rowNum) throws SQLException {
        return new TradeEventRow(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_id", UUID.class),
                rs.getObject("actor_id", UUID.class),
                rs.getString("event"),
                rs.getString("details"),
                rs.getTimestamp("created_at").toInstant());
    }
}
