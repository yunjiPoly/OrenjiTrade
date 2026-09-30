package com.orenjitrade.api.payments.infra;

import com.orenjitrade.api.payments.domain.PaymentRows.SellerAccountRow;
import com.orenjitrade.api.payments.domain.SellerAccountState;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code seller_account} access (explicit SQL); used only inside the payments module. */
@Repository
public class SellerAccountRepository {

    private static final String COLUMNS =
            "user_id, provider, provider_account_id, status, payouts_enabled, created_at,"
                    + " updated_at";

    private final JdbcClient jdbc;

    public SellerAccountRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<SellerAccountRow> find(UUID userId) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM seller_account WHERE user_id = :id")
                .param("id", userId)
                .query(SellerAccountRepository::map)
                .optional();
    }

    /** Creates or replaces the account of a seller. */
    public void upsert(
            UUID userId,
            String provider,
            @Nullable String accountRef,
            SellerAccountState status,
            boolean payoutsEnabled,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO seller_account (user_id, provider, provider_account_id, status,
                            payouts_enabled, created_at, updated_at)
                        VALUES (:id, :provider, :ref, :status, :payouts, :now, :now)
                        ON CONFLICT (user_id) DO UPDATE SET provider = EXCLUDED.provider,
                            provider_account_id = EXCLUDED.provider_account_id,
                            status = EXCLUDED.status,
                            payouts_enabled = EXCLUDED.payouts_enabled,
                            updated_at = EXCLUDED.updated_at
                        """)
                .param("id", userId)
                .param("provider", provider)
                .param("ref", accountRef, Types.VARCHAR)
                .param("status", status.name())
                .param("payouts", payoutsEnabled)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** The provider reported a change of an account; returns whether a row changed. */
    public boolean updateByAccount(
            String provider,
            String accountRef,
            SellerAccountState status,
            boolean payoutsEnabled,
            Instant now) {
        return jdbc.sql(
                                """
                                UPDATE seller_account SET status = :status,
                                       payouts_enabled = :payouts, updated_at = :now
                                 WHERE provider = :provider AND provider_account_id = :ref
                                """)
                        .param("provider", provider)
                        .param("ref", accountRef)
                        .param("status", status.name())
                        .param("payouts", payoutsEnabled)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    static SellerAccountRow map(ResultSet rs, int rowNum) throws SQLException {
        return new SellerAccountRow(
                rs.getObject("user_id", UUID.class),
                rs.getString("provider"),
                rs.getString("provider_account_id"),
                SellerAccountState.valueOf(rs.getString("status")),
                rs.getBoolean("payouts_enabled"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }
}
