package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.location.domain.PublicPlace;
import com.orenjitrade.api.location.domain.StoredLocation;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * JDBC access to {@code user_location} (V108): country, subdivision, optional city and the
 * show-city switch, read with the names of the country and the subdivision. No coordinates exist.
 */
@Repository
public class UserLocationRepository {

    private static final String SELECT =
            """
            SELECT ul.user_id, ul.country_code, co.name AS country_name, co.region_code,
                   ul.subdivision_code, sd.name AS subdivision_name, sd.whole_country,
                   ul.city, ul.show_city, ul.updated_at
              FROM user_location ul
              JOIN country co ON co.code = ul.country_code
              JOIN subdivision sd ON sd.code = ul.subdivision_code
            """;

    private final JdbcClient jdbc;

    public UserLocationRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<StoredLocation> find(UUID userId) {
        return jdbc.sql(SELECT + " WHERE ul.user_id = :userId")
                .param("userId", userId)
                .query(UserLocationRepository::map)
                .optional();
    }

    /** Locations of the given collectors (missing ids have none). */
    public Map<UUID, StoredLocation> findAll(Collection<UUID> userIds) {
        Map<UUID, StoredLocation> result = new LinkedHashMap<>();
        if (userIds.isEmpty()) {
            return result;
        }
        jdbc.sql(SELECT + " WHERE ul.user_id IN (:ids)")
                .param("ids", userIds)
                .query(UserLocationRepository::map)
                .list()
                .forEach(location -> result.put(location.userId(), location));
        return result;
    }

    public boolean exists(UUID userId) {
        return jdbc.sql("SELECT count(*) FROM user_location WHERE user_id = :userId")
                        .param("userId", userId)
                        .query(Long.class)
                        .single()
                > 0;
    }

    /** Inserts or replaces the collector's location. */
    public void upsert(
            UUID userId,
            String countryCode,
            String subdivisionCode,
            @Nullable String city,
            boolean showCity,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO user_location (user_id, country_code, subdivision_code, city,
                            show_city, created_at, updated_at)
                        VALUES (:userId, :country, :subdivision, :city, :showCity, :now, :now)
                        ON CONFLICT (user_id) DO UPDATE SET
                            country_code = EXCLUDED.country_code,
                            subdivision_code = EXCLUDED.subdivision_code,
                            city = EXCLUDED.city,
                            show_city = EXCLUDED.show_city,
                            updated_at = EXCLUDED.updated_at
                        """)
                .param("userId", userId)
                .param("country", countryCode)
                .param("subdivision", subdivisionCode)
                .param("city", city, Types.VARCHAR)
                .param("showCity", showCity)
                .param("now", Timestamp.from(now))
                .update();
    }

    public int delete(UUID userId) {
        return jdbc.sql("DELETE FROM user_location WHERE user_id = :userId")
                .param("userId", userId)
                .update();
    }

    private static StoredLocation map(ResultSet rs, int rowNum) throws SQLException {
        return new StoredLocation(
                rs.getObject("user_id", UUID.class),
                new PublicPlace(
                        rs.getString("region_code"),
                        rs.getString("country_code"),
                        rs.getString("country_name"),
                        rs.getString("subdivision_code"),
                        rs.getString("subdivision_name"),
                        rs.getBoolean("whole_country")),
                rs.getString("city"),
                rs.getBoolean("show_city"),
                rs.getTimestamp("updated_at").toInstant());
    }
}
