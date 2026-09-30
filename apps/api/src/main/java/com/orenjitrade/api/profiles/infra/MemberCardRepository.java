package com.orenjitrade.api.profiles.infra;

import com.orenjitrade.api.auth.domain.AccountStatus;
import com.orenjitrade.api.profiles.domain.MessagingPermission;
import com.orenjitrade.api.profiles.domain.PrivacySettingsView;
import com.orenjitrade.api.profiles.domain.ProfileVisibility;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Batch read of {@code user_account} + {@code profile} + {@code privacy_settings} for member cards
 * (one query per page of messages or posts). Read-only; never touches location tables.
 */
@Repository
public class MemberCardRepository {

    private final JdbcClient jdbc;

    public MemberCardRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Row> find(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(
                        """
                        SELECT u.id, u.handle, u.status, u.suspended_until,
                               COALESCE(pr.display_name,
                                        NULLIF(left(btrim(u.display_name), 80), ''),
                                        u.handle) AS display_name,
                               pr.avatar_key,
                               pr.completed_at IS NOT NULL AS profile_complete,
                               ps.user_id IS NOT NULL AS has_privacy,
                               ps.discoverable, ps.show_distance, ps.show_online_status,
                               ps.show_last_active, ps.profile_visibility,
                               ps.messaging_permission, ps.wishlist_visible,
                               ps.search_discoverable
                          FROM user_account u
                          LEFT JOIN profile pr ON pr.user_id = u.id
                          LEFT JOIN privacy_settings ps ON ps.user_id = u.id
                         WHERE u.id IN (:ids)
                        """)
                .param("ids", ids)
                .query(MemberCardRepository::map)
                .list();
    }

    private static Row map(ResultSet rs, int rowNum) throws SQLException {
        Timestamp suspendedUntil = rs.getTimestamp("suspended_until");
        PrivacySettingsView privacy =
                rs.getBoolean("has_privacy")
                        ? new PrivacySettingsView(
                                rs.getBoolean("discoverable"),
                                rs.getBoolean("show_distance"),
                                rs.getBoolean("show_online_status"),
                                rs.getBoolean("show_last_active"),
                                ProfileVisibility.valueOf(rs.getString("profile_visibility")),
                                MessagingPermission.valueOf(rs.getString("messaging_permission")),
                                rs.getBoolean("wishlist_visible"),
                                rs.getBoolean("search_discoverable"))
                        : PrivacySettingsView.DEFAULTS;
        return new Row(
                rs.getObject("id", UUID.class),
                rs.getString("handle"),
                rs.getString("display_name"),
                rs.getString("avatar_key"),
                AccountStatus.valueOf(rs.getString("status")),
                suspendedUntil == null ? null : suspendedUntil.toInstant(),
                privacy,
                rs.getBoolean("profile_complete"));
    }

    /** One member row. */
    public record Row(
            UUID id,
            String handle,
            String displayName,
            @Nullable String avatarKey,
            AccountStatus status,
            java.time.@Nullable Instant suspendedUntil,
            PrivacySettingsView privacy,
            boolean profileComplete) {}
}
