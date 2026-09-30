package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.PaymentRows.ShipmentRow;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code shipment} access (explicit SQL); used only inside the payments module. */
@Repository
public class ShipmentRepository {

    private static final String COLUMNS =
            "id, trade_id, carrier, tracking_number, notes, shipped_by, shipped_at, delivered_at";

    private final JdbcClient jdbc;

    public ShipmentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Records the shipment; false when the trade was already shipped. */
    public boolean insert(
            UUID tradeId,
            @Nullable String carrier,
            @Nullable String trackingNumber,
            @Nullable String notes,
            UUID shippedBy,
            Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO shipment (trade_id, carrier, tracking_number, notes,
                                    shipped_by, shipped_at, created_at)
                                VALUES (:tradeId, :carrier, :tracking, :notes, :by, :now, :now)
                                ON CONFLICT (trade_id) DO NOTHING
                                """)
                        .param("tradeId", tradeId)
                        .param("carrier", carrier, Types.VARCHAR)
                        .param("tracking", trackingNumber, Types.VARCHAR)
                        .param("notes", notes, Types.VARCHAR)
                        .param("by", shippedBy)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void markDelivered(UUID tradeId, Instant now) {
        jdbc.sql(
                        "UPDATE shipment SET delivered_at = :now WHERE trade_id = :tradeId AND"
                                + " delivered_at IS NULL")
                .param("tradeId", tradeId)
                .param("now", Timestamp.from(now))
                .update();
    }

    public Optional<ShipmentRow> byTrade(UUID tradeId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM shipment WHERE trade_id = :tradeId")
                .param("tradeId", tradeId)
                .query(ShipmentRepository::map)
                .optional();
    }

    public Map<UUID, ShipmentRow> byTrades(Collection<UUID> tradeIds) {
        Map<UUID, ShipmentRow> result = new LinkedHashMap<>();
        if (tradeIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT " + COLUMNS + " FROM shipment WHERE trade_id IN (:ids)")
                .param("ids", List.copyOf(tradeIds))
                .query(ShipmentRepository::map)
                .list()
                .forEach(row -> result.put(row.tradeId(), row));
        return result;
    }

    static ShipmentRow map(ResultSet rs, int rowNum) throws SQLException {
        return new ShipmentRow(
                rs.getObject("id", UUID.class),
                rs.getObject("trade_id", UUID.class),
                rs.getString("carrier"),
                rs.getString("tracking_number"),
                rs.getString("notes"),
                rs.getObject("shipped_by", UUID.class),
                rs.getTimestamp("shipped_at").toInstant(),
                PaymentRepository.instant(rs, "delivered_at"));
    }
}
