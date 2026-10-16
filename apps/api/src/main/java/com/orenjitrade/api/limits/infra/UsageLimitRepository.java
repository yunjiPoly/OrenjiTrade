package com.orenjitrade.api.limits.infra;

import com.orenjitrade.api.limits.domain.LimitKind;
import com.orenjitrade.api.limits.domain.LimitWindow;
import com.orenjitrade.api.limits.domain.UsageLimitRule;
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

/** {@code usage_limit} access (explicit SQL): one row per limit key, the same for everyone. */
@Repository
public class UsageLimitRepository {

    private static final String COLUMNS =
            "id, limit_key, kind, limit_window, max_value, description, updated_by, updated_at";

    private final JdbcClient jdbc;

    public UsageLimitRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Every usage limit, by key. */
    public List<UsageLimitRule> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM usage_limit ORDER BY limit_key")
                .query((rs, rowNum) -> map(rs))
                .list();
    }

    /** The limit row, locked for update. */
    public Optional<UsageLimitRule> lock(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM usage_limit WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, rowNum) -> map(rs))
                .optional();
    }

    public void update(
            UUID id,
            LimitWindow window,
            @Nullable Integer maxValue,
            String description,
            UUID updatedBy,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE usage_limit SET limit_window = :window, max_value = :maxValue,
                               description = :description, updated_by = :updatedBy, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("window", window.name())
                .param("maxValue", maxValue, Types.INTEGER)
                .param("description", description)
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    private static UsageLimitRule map(ResultSet rs) throws SQLException {
        int max = rs.getInt("max_value");
        @Nullable Integer maxValue = rs.wasNull() ? null : max;
        return new UsageLimitRule(
                rs.getObject("id", UUID.class),
                rs.getString("limit_key"),
                LimitKind.valueOf(rs.getString("kind")),
                LimitWindow.valueOf(rs.getString("limit_window")),
                maxValue,
                rs.getString("description"),
                rs.getObject("updated_by", UUID.class),
                rs.getTimestamp("updated_at").toInstant());
    }
}
