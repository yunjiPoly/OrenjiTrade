package com.orenjitrade.api.offers.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code offer_preferences} access; used only inside the offers module. */
@Repository
public class OfferPreferencesRepository {

    private final JdbcClient jdbc;

    public OfferPreferencesRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The stored switch, empty when the collector never saved it (defaults apply). */
    public Optional<Boolean> acceptsMixed(UUID userId) {
        return jdbc.sql("SELECT accepts_mixed FROM offer_preferences WHERE user_id = :id")
                .param("id", userId)
                .query(Boolean.class)
                .optional();
    }

    public void upsert(UUID userId, boolean acceptsMixed, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO offer_preferences (user_id, accepts_mixed, updated_at)
                        VALUES (:id, :acceptsMixed, :now)
                        ON CONFLICT (user_id) DO UPDATE
                           SET accepts_mixed = EXCLUDED.accepts_mixed,
                               updated_at = EXCLUDED.updated_at
                        """)
                .param("id", userId)
                .param("acceptsMixed", acceptsMixed)
                .param("now", Timestamp.from(now))
                .update();
    }

    public void delete(UUID userId) {
        jdbc.sql("DELETE FROM offer_preferences WHERE user_id = :id").param("id", userId).update();
    }
}
