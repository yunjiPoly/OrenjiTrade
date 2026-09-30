package com.orenjitrade.api.common.settings;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Namespaced access to the shared {@code platform_settings} table (V080, ADR 0014) for the modules
 * that keep their configurable numbers there under their own key prefix ({@code credits.*}, {@code
 * donations.*}). Each module reads and writes only its prefix and validates types and bounds
 * itself; the payments module keeps its own repository for {@code payments.*}.
 */
@Component
public class PlatformSettingsStore {

    private final JdbcClient jdbc;

    public PlatformSettingsStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * A stored setting.
     *
     * @param key dotted key
     * @param json value as JSON text (a scalar)
     * @param updatedBy last admin editor, {@code null} for migration defaults
     * @param updatedAt last change
     */
    public record Setting(String key, String json, @Nullable UUID updatedBy, Instant updatedAt) {}

    /** The settings whose key starts with {@code prefix + "."}, by key. */
    public Map<String, Setting> read(String prefix) {
        Map<String, Setting> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT key, value::text AS value, updated_by, updated_at FROM"
                                + " platform_settings WHERE key LIKE :prefix ORDER BY key")
                .param("prefix", prefix + ".%")
                .query(
                        rs -> {
                            result.put(
                                    rs.getString("key"),
                                    new Setting(
                                            rs.getString("key"),
                                            rs.getString("value"),
                                            rs.getObject("updated_by", UUID.class),
                                            rs.getTimestamp("updated_at").toInstant()));
                        });
        return result;
    }

    /** Locks the rows of a prefix (serialises admin writes). */
    public void lock(String prefix) {
        jdbc.sql("SELECT key FROM platform_settings WHERE key LIKE :prefix FOR UPDATE")
                .param("prefix", prefix + ".%")
                .query(String.class)
                .list();
    }

    /** Stores the JSON text of an existing key; returns whether a row changed. */
    public boolean write(String key, String json, UUID updatedBy, Instant now) {
        return jdbc.sql(
                                """
                                UPDATE platform_settings SET value = CAST(:value AS jsonb),
                                       updated_by = :updatedBy, updated_at = :now
                                 WHERE key = :key
                                """)
                        .param("key", key)
                        .param("value", json)
                        .param("updatedBy", updatedBy)
                        .param("now", Timestamp.from(now))
                        .update()
                > 0;
    }
}
