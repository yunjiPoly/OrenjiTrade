package com.orenjitrade.api.credits.infra;

import com.orenjitrade.api.credits.domain.CreditRows.Redemption;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code referral_code} and {@code referral_redemption} access (explicit SQL; credits only). */
@Repository
public class ReferralRepository {

    private static final String REDEMPTION_COLUMNS =
            "id, referrer_id, referee_id, code, referrer_reward, referee_reward, created_at";

    private final JdbcClient jdbc;

    public ReferralRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> codeOf(UUID userId) {
        return jdbc.sql("SELECT code FROM referral_code WHERE user_id = :userId")
                .param("userId", userId)
                .query(String.class)
                .optional();
    }

    public Optional<UUID> ownerOf(String code) {
        return jdbc.sql("SELECT user_id FROM referral_code WHERE code = :code")
                .param("code", code)
                .query(UUID.class)
                .optional();
    }

    /** Stores a code unless the account or the code already has one; returns whether it did. */
    public boolean insertCode(UUID userId, String code, Instant now) {
        return jdbc.sql(
                                """
                                INSERT INTO referral_code (user_id, code, created_at)
                                VALUES (:userId, :code, :now)
                                ON CONFLICT DO NOTHING
                                """)
                        .param("userId", userId)
                        .param("code", code)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }

    public void deleteCode(UUID userId) {
        jdbc.sql("DELETE FROM referral_code WHERE user_id = :userId")
                .param("userId", userId)
                .update();
    }

    public Optional<Redemption> redemptionOf(UUID refereeId) {
        return jdbc.sql(
                        "SELECT "
                                + REDEMPTION_COLUMNS
                                + " FROM referral_redemption WHERE referee_id = :id")
                .param("id", refereeId)
                .query(ReferralRepository::map)
                .optional();
    }

    public int countRedemptions(UUID referrerId) {
        return jdbc.sql("SELECT count(*) FROM referral_redemption WHERE referrer_id = :id")
                .param("id", referrerId)
                .query(Integer.class)
                .single();
    }

    /** Stores a redemption; false when the referee already redeemed a code. */
    public boolean insertRedemption(Redemption redemption) {
        return jdbc.sql(
                                """
                                INSERT INTO referral_redemption (id, referrer_id, referee_id, code,
                                    referrer_reward, referee_reward, created_at)
                                VALUES (:id, :referrerId, :refereeId, :code, :referrerReward,
                                    :refereeReward, :now)
                                ON CONFLICT (referee_id) DO NOTHING
                                """)
                        .param("id", redemption.id())
                        .param("referrerId", redemption.referrerId())
                        .param("refereeId", redemption.refereeId())
                        .param("code", redemption.code())
                        .param("referrerReward", redemption.referrerReward())
                        .param("refereeReward", redemption.refereeReward())
                        .param("now", Timestamp.from(redemption.createdAt()))
                        .update()
                > 0;
    }

    /** Redemptions where the account is the referrer or the referee (export). */
    public List<Redemption> involving(UUID userId) {
        return jdbc.sql(
                        "SELECT "
                                + REDEMPTION_COLUMNS
                                + " FROM referral_redemption WHERE referrer_id = :id OR"
                                + " referee_id = :id ORDER BY created_at")
                .param("id", userId)
                .query(ReferralRepository::map)
                .list();
    }

    static Redemption map(ResultSet rs, int rowNum) throws SQLException {
        return new Redemption(
                rs.getObject("id", UUID.class),
                rs.getObject("referrer_id", UUID.class),
                rs.getObject("referee_id", UUID.class),
                rs.getString("code"),
                rs.getInt("referrer_reward"),
                rs.getInt("referee_reward"),
                rs.getTimestamp("created_at").toInstant());
    }
}
