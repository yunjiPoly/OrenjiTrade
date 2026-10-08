package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.location.domain.CountryView;
import com.orenjitrade.api.location.domain.RegionView;
import com.orenjitrade.api.location.domain.SubdivisionView;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** JDBC access to {@code platform_region}, {@code country} and {@code subdivision} (V106). */
@Repository
public class RegionRepository {

    private final JdbcClient jdbc;

    public RegionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Every region with its countries (display order) and their subdivisions (by name). */
    public List<RegionView> findAll() {
        Map<String, List<SubdivisionView>> subdivisions = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT code, country_code, name, whole_country FROM subdivision"
                                + " ORDER BY country_code, unaccent_immutable(name), code")
                .query(
                        rs -> {
                            subdivisions
                                    .computeIfAbsent(
                                            rs.getString("country_code"), key -> new ArrayList<>())
                                    .add(
                                            new SubdivisionView(
                                                    rs.getString("code"),
                                                    rs.getString("name"),
                                                    rs.getBoolean("whole_country")));
                        });
        Map<String, List<CountryView>> countries = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT code, name, region_code, active, sort_order FROM country"
                                + " ORDER BY sort_order, name, code")
                .query(
                        rs -> {
                            String code = rs.getString("code");
                            countries
                                    .computeIfAbsent(
                                            rs.getString("region_code"), key -> new ArrayList<>())
                                    .add(
                                            new CountryView(
                                                    code,
                                                    rs.getString("name"),
                                                    rs.getString("region_code"),
                                                    rs.getBoolean("active"),
                                                    rs.getInt("sort_order"),
                                                    subdivisions.getOrDefault(code, List.of())));
                        });
        return jdbc.sql(
                        "SELECT code, name, is_default, sort_order FROM platform_region"
                                + " ORDER BY sort_order, code")
                .query(
                        (rs, rowNum) ->
                                new RegionView(
                                        rs.getString("code"),
                                        rs.getString("name"),
                                        rs.getBoolean("is_default"),
                                        rs.getInt("sort_order"),
                                        countries.getOrDefault(rs.getString("code"), List.of())))
                .list();
    }

    /** Moves a country to another region and/or (de)activates it; false when unknown. */
    public boolean updateCountry(
            String code, String regionCode, boolean active, UUID actorId, Instant now) {
        return jdbc.sql(
                                """
                                UPDATE country SET region_code = :region, active = :active,
                                       updated_by = :actor, updated_at = :now
                                 WHERE code = :code
                                """)
                        .param("code", code)
                        .param("region", regionCode)
                        .param("active", active)
                        .param("actor", actorId)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }
}
