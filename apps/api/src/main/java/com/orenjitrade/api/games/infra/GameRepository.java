package com.orenjitrade.api.games.infra;

import com.orenjitrade.api.games.domain.GameSchema;
import com.orenjitrade.api.games.domain.GameStatus;
import com.orenjitrade.api.games.domain.GameView;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/** {@code game} access (explicit SQL; the schema column is JSONB). */
@Repository
public class GameRepository {

    private static final String COLUMNS =
            "id, slug, name, short_name, publisher, status, sort_order, schema::text AS schema,"
                    + " updated_at";

    private final JdbcClient jdbc;
    private final JsonMapper jsonMapper;

    public GameRepository(JdbcClient jdbc, JsonMapper jsonMapper) {
        this.jdbc = jdbc;
        this.jsonMapper = jsonMapper;
    }

    /** Every game (active and hidden), by sort order then slug. */
    public List<GameView> findAll() {
        return jdbc.sql("SELECT " + COLUMNS + " FROM game ORDER BY sort_order, slug")
                .query(this::map)
                .list();
    }

    public Optional<GameView> findBySlugForUpdate(String slug) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM game WHERE slug = :slug FOR UPDATE")
                .param("slug", slug)
                .query(this::map)
                .optional();
    }

    public boolean existsBySlug(String slug) {
        return jdbc.sql("SELECT count(*) FROM game WHERE slug = :slug")
                        .param("slug", slug)
                        .query(Long.class)
                        .single()
                > 0;
    }

    public void insert(
            UUID id,
            String slug,
            String name,
            String shortName,
            String publisher,
            GameStatus status,
            int sortOrder,
            GameSchema schema,
            Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO game (id, slug, name, short_name, publisher, status, sort_order,
                            schema, created_at, updated_at)
                        VALUES (:id, :slug, :name, :shortName, :publisher, :status, :sortOrder,
                            CAST(:schema AS jsonb), :now, :now)
                        """)
                .param("id", id)
                .param("slug", slug)
                .param("name", name)
                .param("shortName", shortName)
                .param("publisher", publisher)
                .param("status", status.name())
                .param("sortOrder", sortOrder)
                .param("schema", jsonMapper.writeValueAsString(schema))
                .param("now", Timestamp.from(now))
                .update();
    }

    public void update(
            UUID id,
            String name,
            String shortName,
            String publisher,
            GameStatus status,
            int sortOrder,
            GameSchema schema,
            Instant now) {
        jdbc.sql(
                        """
                        UPDATE game SET name = :name, short_name = :shortName, publisher = :publisher,
                               status = :status, sort_order = :sortOrder,
                               schema = CAST(:schema AS jsonb), updated_at = :now
                         WHERE id = :id
                        """)
                .param("id", id)
                .param("name", name)
                .param("shortName", shortName)
                .param("publisher", publisher)
                .param("status", status.name())
                .param("sortOrder", sortOrder)
                .param("schema", jsonMapper.writeValueAsString(schema))
                .param("now", Timestamp.from(now))
                .update();
    }

    private GameView map(ResultSet rs, int rowNum) throws SQLException {
        return new GameView(
                rs.getObject("id", UUID.class),
                rs.getString("slug"),
                rs.getString("name"),
                rs.getString("short_name"),
                rs.getString("publisher"),
                GameStatus.valueOf(rs.getString("status")),
                rs.getInt("sort_order"),
                jsonMapper.readValue(rs.getString("schema"), GameSchema.class),
                rs.getTimestamp("updated_at").toInstant());
    }
}
