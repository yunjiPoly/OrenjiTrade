package com.orenjitrade.api.credits.infra;

import com.orenjitrade.api.credits.domain.CreditRows.CreditProduct;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code credit_product} access (explicit SQL; credits only). */
@Repository
public class CreditProductRepository {

    private static final String COLUMNS =
            "key, name, description, feature_key, feature_value, cost, duration_hours, active,"
                    + " sort_order, updated_by, updated_at";

    private final JdbcClient jdbc;

    public CreditProductRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<CreditProduct> all() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM credit_product ORDER BY sort_order, key")
                .query(CreditProductRepository::map)
                .list();
    }

    public Optional<CreditProduct> lock(String key) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM credit_product WHERE key = :key FOR UPDATE")
                .param("key", key)
                .query(CreditProductRepository::map)
                .optional();
    }

    public void update(
            String key,
            String name,
            String description,
            @Nullable String featureValue,
            int cost,
            int durationHours,
            boolean active,
            int sortOrder,
            UUID updatedBy,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE credit_product SET name = :name, description = :description,
                               feature_value = :value, cost = :cost,
                               duration_hours = :duration, active = :active,
                               sort_order = :sortOrder, updated_by = :updatedBy,
                               updated_at = :now
                         WHERE key = :key
                        """)
                .param("key", key)
                .param("name", name)
                .param("description", description)
                .param("value", featureValue, Types.VARCHAR)
                .param("cost", cost)
                .param("duration", durationHours)
                .param("active", active)
                .param("sortOrder", sortOrder)
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    static CreditProduct map(ResultSet rs, int rowNum) throws SQLException {
        return new CreditProduct(
                rs.getString("key"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getString("feature_key"),
                rs.getString("feature_value"),
                rs.getInt("cost"),
                rs.getInt("duration_hours"),
                rs.getBoolean("active"),
                rs.getInt("sort_order"),
                rs.getObject("updated_by", UUID.class),
                rs.getTimestamp("updated_at").toInstant());
    }
}
