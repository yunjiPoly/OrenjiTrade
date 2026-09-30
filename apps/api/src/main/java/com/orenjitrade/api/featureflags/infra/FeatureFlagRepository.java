package com.orenjitrade.api.featureflags.infra;

import com.orenjitrade.api.featureflags.domain.FeatureFlagView;
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

/** {@code feature_flag} access (explicit SQL). */
@Repository
public class FeatureFlagRepository {

    private static final String COLUMNS =
            "key, enabled, rollout_percent, description, updated_by, updated_at";

    private final JdbcClient jdbc;

    public FeatureFlagRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<FeatureFlagView> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM feature_flag ORDER BY key")
                .query(FeatureFlagRepository::map)
                .list();
    }

    public Optional<FeatureFlagView> findForUpdate(String key) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM feature_flag WHERE key = :key FOR UPDATE")
                .param("key", key)
                .query(FeatureFlagRepository::map)
                .optional();
    }

    public void update(
            String key,
            boolean enabled,
            int rolloutPercent,
            String description,
            @Nullable UUID updatedBy,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE feature_flag
                           SET enabled = :enabled, rollout_percent = :rollout,
                               description = :description, updated_by = :updatedBy, updated_at = :now
                         WHERE key = :key
                        """)
                .param("key", key)
                .param("enabled", enabled)
                .param("rollout", rolloutPercent)
                .param("description", description)
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    /**
     * Seed helper: enables {@code key} unless an admin already changed it ({@code updated_by} set).
     *
     * @return whether the row changed
     */
    public boolean enableUnlessEditedByAdmin(String key, Instant now) {
        return jdbc.sql(
                                """
                                UPDATE feature_flag SET enabled = true, updated_at = :now
                                 WHERE key = :key AND updated_by IS NULL AND NOT enabled
                                """)
                        .param("key", key)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    private static FeatureFlagView map(ResultSet rs, int rowNum) throws SQLException {
        return new FeatureFlagView(
                rs.getString("key"),
                rs.getBoolean("enabled"),
                rs.getInt("rollout_percent"),
                rs.getString("description"),
                rs.getObject("updated_by", UUID.class),
                rs.getTimestamp("updated_at").toInstant());
    }
}
