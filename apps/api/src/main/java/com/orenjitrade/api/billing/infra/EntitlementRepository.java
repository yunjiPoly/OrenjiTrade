package com.orenjitrade.api.billing.infra;

import com.orenjitrade.api.billing.domain.EntitlementSource;
import com.orenjitrade.api.billing.domain.EntitlementView;
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

/** {@code entitlement} access (explicit SQL). */
@Repository
public class EntitlementRepository {

    private static final String COLUMNS =
            "id, user_id, feature_key, value, source, expires_at, granted_by, note, created_at,"
                    + " revoked_at";

    private final JdbcClient jdbc;

    public EntitlementRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Not revoked and not expired at {@code now}, newest first. */
    public List<EntitlementView> findActive(UUID userId, Instant now) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM entitlement WHERE user_id = :userId AND revoked_at IS NULL"
                                + " AND (expires_at IS NULL OR expires_at > :now)"
                                + " ORDER BY created_at DESC, id")
                .param("userId", userId)
                .param("now", Timestamp.from(now))
                .query(EntitlementRepository::map)
                .list();
    }

    /** Every entitlement of the user (history included), newest first. */
    public List<EntitlementView> findAll(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM entitlement WHERE user_id = :userId"
                                + " ORDER BY created_at DESC, id")
                .param("userId", userId)
                .query(EntitlementRepository::map)
                .list();
    }

    public Optional<EntitlementView> findForUpdate(UUID id, UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + COLUMNS
                                + " FROM entitlement WHERE id = :id AND user_id = :userId FOR"
                                + " UPDATE")
                .param("id", id)
                .param("userId", userId)
                .query(EntitlementRepository::map)
                .optional();
    }

    public EntitlementView insert(
            UUID userId,
            String featureKey,
            @Nullable String value,
            EntitlementSource source,
            @Nullable Instant expiresAt,
            @Nullable UUID grantedBy,
            @Nullable String note,
            Instant now) {
        UUID id = UUID.randomUUID();
        jdbc.sql(
                        """
                        INSERT INTO entitlement (id, user_id, feature_key, value, source, expires_at,
                            granted_by, note, created_at)
                        VALUES (:id, :userId, :key, :value, :source, :expiresAt, :grantedBy, :note, :now)
                        """)
                .param("id", id)
                .param("userId", userId)
                .param("key", featureKey)
                .param("value", value)
                .param("source", source.name())
                .param("expiresAt", expiresAt == null ? null : Timestamp.from(expiresAt))
                .param("grantedBy", grantedBy)
                .param("note", note)
                .param("now", Timestamp.from(now))
                .update();
        return new EntitlementView(
                id, userId, featureKey, value, source, expiresAt, grantedBy, note, now, null);
    }

    public void revoke(UUID id, UUID revokedBy, Instant now) {
        jdbc.sql(
                        "UPDATE entitlement SET revoked_at = :now, revoked_by = :revokedBy WHERE id"
                                + " = :id")
                .param("id", id)
                .param("revokedBy", revokedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    private static EntitlementView map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp expires = rs.getTimestamp("expires_at");
        Timestamp revoked = rs.getTimestamp("revoked_at");
        return new EntitlementView(
                rs.getObject("id", UUID.class),
                rs.getObject("user_id", UUID.class),
                rs.getString("feature_key"),
                rs.getString("value"),
                EntitlementSource.valueOf(rs.getString("source")),
                expires == null ? null : expires.toInstant(),
                rs.getObject("granted_by", UUID.class),
                rs.getString("note"),
                rs.getTimestamp("created_at").toInstant(),
                revoked == null ? null : revoked.toInstant());
    }
}
