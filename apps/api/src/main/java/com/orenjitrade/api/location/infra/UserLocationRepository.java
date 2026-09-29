package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.location.domain.PublicPoint;
import com.orenjitrade.api.location.domain.StoredLocation;
import com.orenjitrade.api.location.domain.TradingAreaSource;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * JDBC access to {@code user_location} (explicit PostGIS SQL instead of JPA spatial mapping). The
 * only class that reads {@code trading_area_center}; {@code home_point} is never selected.
 */
@Repository
public class UserLocationRepository {

    private static final String SELECT =
            """
            SELECT user_id,
                   ST_Y(trading_area_center::geometry) AS centre_lat,
                   ST_X(trading_area_center::geometry) AS centre_lng,
                   trading_area_radius_m, source,
                   ST_Y(public_point::geometry) AS public_lat,
                   ST_X(public_point::geometry) AS public_lng,
                   public_label, grid_cell, updated_at
              FROM user_location
            """;

    private final JdbcClient jdbc;

    public UserLocationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<StoredLocation> find(UUID userId) {
        return jdbc.sql(SELECT + " WHERE user_id = :userId")
                .param("userId", userId)
                .query(UserLocationRepository::map)
                .optional();
    }

    public boolean exists(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM user_location WHERE user_id = :userId")
                        .param("userId", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    /** Inserts or replaces the trading area and its derived public values. */
    public void upsert(
            UUID userId,
            double centreLat,
            double centreLng,
            int radiusMeters,
            TradingAreaSource source,
            @Nullable PublicPoint publicPoint,
            String publicLabel,
            @Nullable String gridCell,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO user_location (user_id, trading_area_center, trading_area_radius_m,
                            source, public_point, public_label, grid_cell, created_at, updated_at)
                        VALUES (:userId,
                            ST_SetSRID(ST_MakePoint(:centreLng, :centreLat), 4326)::geography,
                            :radius, :source,
                            CASE WHEN :hasPublic THEN
                                ST_SetSRID(ST_MakePoint(:publicLng, :publicLat), 4326)::geography
                            END,
                            :label, :gridCell, :now, :now)
                        ON CONFLICT (user_id) DO UPDATE SET
                            trading_area_center = EXCLUDED.trading_area_center,
                            trading_area_radius_m = EXCLUDED.trading_area_radius_m,
                            source = EXCLUDED.source,
                            public_point = EXCLUDED.public_point,
                            public_label = EXCLUDED.public_label,
                            grid_cell = EXCLUDED.grid_cell,
                            updated_at = EXCLUDED.updated_at
                        """)
                .param("userId", userId)
                .param("centreLat", centreLat)
                .param("centreLng", centreLng)
                .param("radius", radiusMeters)
                .param("source", source.name())
                .param("hasPublic", publicPoint != null)
                .param("publicLat", publicPoint == null ? 0.0 : publicPoint.lat())
                .param("publicLng", publicPoint == null ? 0.0 : publicPoint.lng())
                .param("label", publicLabel)
                .param("gridCell", gridCell)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** Sets (or clears, with {@code null}) the public point and its grid cell. */
    public void updatePublicPoint(
            UUID userId,
            @Nullable PublicPoint publicPoint,
            @Nullable String gridCell,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE user_location SET
                            public_point = CASE WHEN :hasPublic THEN
                                ST_SetSRID(ST_MakePoint(:publicLng, :publicLat), 4326)::geography
                            END,
                            grid_cell = :gridCell,
                            updated_at = :now
                        WHERE user_id = :userId
                        """)
                .param("userId", userId)
                .param("hasPublic", publicPoint != null)
                .param("publicLat", publicPoint == null ? 0.0 : publicPoint.lat())
                .param("publicLng", publicPoint == null ? 0.0 : publicPoint.lng())
                .param("gridCell", publicPoint == null ? null : gridCell)
                .param("now", Timestamp.from(now))
                .update();
    }

    public int delete(UUID userId) {
        return jdbc.sql("DELETE FROM user_location WHERE user_id = :userId")
                .param("userId", userId)
                .update();
    }

    private static StoredLocation map(ResultSet rs, int rowNum) throws SQLException {
        double publicLat = rs.getDouble("public_lat");
        boolean hasPublic = !rs.wasNull();
        double publicLng = rs.getDouble("public_lng");
        return new StoredLocation(
                rs.getObject("user_id", UUID.class),
                rs.getDouble("centre_lat"),
                rs.getDouble("centre_lng"),
                rs.getInt("trading_area_radius_m"),
                TradingAreaSource.valueOf(rs.getString("source")),
                hasPublic ? new PublicPoint(publicLat, publicLng) : null,
                rs.getString("public_label"),
                rs.getString("grid_cell"),
                rs.getTimestamp("updated_at").toInstant());
    }
}
