package com.orenjitrade.api.users.infra;

import com.orenjitrade.api.auth.domain.Role;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Race-safe first-login insert: {@code INSERT ... ON CONFLICT (provider_uid) DO NOTHING} so two
 * concurrent first requests of the same identity never create two accounts. The caller reloads the
 * row afterwards, whichever request won.
 */
@Component
public class UserAccountProvisioner {

    private final JdbcClient jdbc;

    public UserAccountProvisioner(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * @return {@code true} when this call inserted the account, {@code false} when it already
     *     existed (provider uid conflict). A handle collision surfaces as a {@link
     *     org.springframework.dao.DataIntegrityViolationException} for the caller to retry.
     */
    @Transactional
    public boolean insertIfAbsent(
            UUID id,
            String providerUid,
            @Nullable String email,
            boolean emailVerified,
            String handle,
            @Nullable String displayName,
            Instant now) {
        int inserted =
                jdbc.sql(
                                """
                                INSERT INTO user_account (id, provider_uid, email, email_verified,
                                    handle, display_name, status, plan_code, created_at, updated_at,
                                    last_active_at)
                                VALUES (:id, :providerUid, :email, :emailVerified, :handle,
                                    :displayName, 'ACTIVE', 'FREE', :now, :now, :now)
                                ON CONFLICT (provider_uid) DO NOTHING
                                """)
                        .param("id", id)
                        .param("providerUid", providerUid)
                        .param("email", email)
                        .param("emailVerified", emailVerified)
                        .param("handle", handle)
                        .param("displayName", displayName)
                        .param("now", java.sql.Timestamp.from(now))
                        .update();
        if (inserted == 0) {
            return false;
        }
        jdbc.sql(
                        """
                        INSERT INTO user_role (user_id, role, granted_at, granted_by)
                        VALUES (:id, :role, :now, NULL)
                        ON CONFLICT (user_id, role) DO NOTHING
                        """)
                .param("id", id)
                .param("role", Role.USER.name())
                .param("now", java.sql.Timestamp.from(now))
                .update();
        return true;
    }
}
