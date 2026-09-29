package com.orenjitrade.api.delisting.infra;

import com.orenjitrade.api.delisting.domain.DelistPolicyView;
import com.orenjitrade.api.delisting.domain.FreshnessPolicy;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code delist_policy} access. */
@Repository
public class DelistPolicyRepository {

    private static final String COLUMNS =
            "id, name, aging_after_days, stale_after_days, hidden_after_days,"
                    + " warn_before_hidden_days, max_strikes, updated_by, updated_at, active";

    private final JdbcClient jdbc;

    public DelistPolicyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The single active policy. */
    public Optional<FreshnessPolicy> findActive() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM delist_policy WHERE active")
                .query(DelistPolicyRepository::map)
                .optional();
    }

    /** Every policy with its active flag, active first. */
    public List<DelistPolicyView> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM delist_policy ORDER BY active DESC, name, id")
                .query(
                        (rs, rowNum) ->
                                new DelistPolicyView(map(rs, rowNum), rs.getBoolean("active")))
                .list();
    }

    public Optional<DelistPolicyView> findByIdForUpdate(UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM delist_policy WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query(
                        (rs, rowNum) ->
                                new DelistPolicyView(map(rs, rowNum), rs.getBoolean("active")))
                .optional();
    }

    public void update(FreshnessPolicy policy, UUID updatedBy, Instant now) {
        jdbc.sql(
                        """
                        UPDATE delist_policy
                           SET name = :name, aging_after_days = :aging, stale_after_days = :stale,
                               hidden_after_days = :hidden, warn_before_hidden_days = :warn,
                               max_strikes = :strikes, updated_by = :updatedBy, updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", policy.id())
                .param("name", policy.name())
                .param("aging", policy.agingAfterDays())
                .param("stale", policy.staleAfterDays())
                .param("hidden", policy.hiddenAfterDays())
                .param("warn", policy.warnBeforeHiddenDays())
                .param("strikes", policy.maxStrikes())
                .param("updatedBy", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    private static FreshnessPolicy map(ResultSet rs, int rowNum) throws SQLException {
        return new FreshnessPolicy(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getInt("aging_after_days"),
                rs.getInt("stale_after_days"),
                rs.getInt("hidden_after_days"),
                rs.getInt("warn_before_hidden_days"),
                rs.getInt("max_strikes"),
                rs.getObject("updated_by", UUID.class),
                rs.getTimestamp("updated_at").toInstant());
    }
}
