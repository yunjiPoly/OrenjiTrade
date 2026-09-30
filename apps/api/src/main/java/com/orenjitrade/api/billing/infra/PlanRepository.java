package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.LimitKind;
import com.orenjitrade.api.billing.domain.LimitWindow;
import com.orenjitrade.api.billing.domain.PlanFeatureRule;
import com.orenjitrade.api.billing.domain.PlanRules;
import com.orenjitrade.api.billing.domain.UsageLimitRule;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code plan}, {@code plan_feature} and {@code usage_limit} access (explicit SQL). */
@Repository
public class PlanRepository {

    private final JdbcClient jdbc;

    public PlanRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Every plan (active or not) with its features and limits, by sort order then code. */
    public List<PlanRules> findAll() {
        Map<UUID, List<PlanFeatureRule>> features = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT plan_id, feature_key, enabled, value FROM plan_feature ORDER BY"
                                + " feature_key")
                .query(
                        rs -> {
                            features.computeIfAbsent(
                                            rs.getObject("plan_id", UUID.class),
                                            id -> new ArrayList<>())
                                    .add(
                                            new PlanFeatureRule(
                                                    rs.getString("feature_key"),
                                                    rs.getBoolean("enabled"),
                                                    rs.getString("value")));
                        });
        Map<UUID, List<UsageLimitRule>> limits = new LinkedHashMap<>();
        jdbc.sql(
                        """
                        SELECT id, plan_id, limit_key, kind, limit_window, max_value, description,
                               updated_by, updated_at
                          FROM usage_limit ORDER BY limit_key
                        """)
                .query(
                        rs -> {
                            limits.computeIfAbsent(
                                            rs.getObject("plan_id", UUID.class),
                                            id -> new ArrayList<>())
                                    .add(mapLimit(rs));
                        });
        return jdbc.sql(
                        """
                        SELECT id, code, name, description, monthly_price, currency, active,
                               sort_order, updated_by, updated_at
                          FROM plan ORDER BY sort_order, code
                        """)
                .query(
                        (rs, rowNum) -> {
                            UUID id = rs.getObject("id", UUID.class);
                            return new PlanRules(
                                    id,
                                    rs.getString("code"),
                                    rs.getString("name"),
                                    rs.getString("description"),
                                    rs.getBigDecimal("monthly_price"),
                                    rs.getString("currency"),
                                    rs.getBoolean("active"),
                                    rs.getInt("sort_order"),
                                    features.getOrDefault(id, List.of()),
                                    limits.getOrDefault(id, List.of()),
                                    rs.getObject("updated_by", UUID.class),
                                    rs.getTimestamp("updated_at").toInstant());
                        })
                .list();
    }

    /** Locks the plan row of {@code code} and returns its id. */
    public Optional<UUID> lockPlan(String code) {
        return jdbc.sql("SELECT id FROM plan WHERE code = :code FOR UPDATE")
                .param("code", code)
                .query(UUID.class)
                .optional();
    }

    public void updatePlan(
            UUID id,
            String name,
            String description,
            BigDecimal monthlyPrice,
            String currency,
            boolean active,
            int sortOrder,
            UUID updatedBy,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE plan SET name = :name, description = :description,
                               monthly_price = :price, currency = :currency, active = :active,
                               sort_order = :sortOrder, updated_by = :updatedBy, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("name", name)
                .param("description", description)
                .param("price", monthlyPrice)
                .param("currency", currency)
                .param("active", active)
                .param("sortOrder", sortOrder)
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void upsertFeature(
            UUID planId,
            String key,
            boolean enabled,
            @Nullable String value,
            UUID updatedBy,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO plan_feature (plan_id, feature_key, enabled, value, updated_by, updated_at)
                        VALUES (:planId, :key, :enabled, :value, :updatedBy, :now)
                        ON CONFLICT (plan_id, feature_key) DO UPDATE
                           SET enabled = EXCLUDED.enabled, value = EXCLUDED.value,
                               updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
                        """)
                .param("planId", planId)
                .param("key", key)
                .param("enabled", enabled)
                .param("value", value)
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The limit row with its plan code, locked for update. */
    public Optional<LockedLimit> lockLimit(UUID id) {
        return jdbc.sql(
                        """
                        SELECT l.id, l.plan_id, l.limit_key, l.kind, l.limit_window, l.max_value,
                               l.description, l.updated_by, l.updated_at, p.code AS plan_code
                          FROM usage_limit l JOIN plan p ON p.id = l.plan_id
                         WHERE l.id = :id
                           FOR UPDATE OF l
                        """)
                .param("id", id)
                .query((rs, rowNum) -> new LockedLimit(rs.getString("plan_code"), mapLimit(rs)))
                .optional();
    }

    public void updateLimit(
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
                .param("maxValue", maxValue, java.sql.Types.INTEGER)
                .param("description", description)
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    private static UsageLimitRule mapLimit(ResultSet rs) throws SQLException {
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

    /** A usage limit with the code of its plan. */
    public record LockedLimit(String planCode, UsageLimitRule limit) {}
}
