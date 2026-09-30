package com.orenjitrade.api.payments.infra;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * {@code platform_settings} rows of one prefix (the payments module reads and writes {@code
 * payments.*} only). Values are JSON scalars kept as their JSON text.
 */
@Repository
public class PlatformSettingsRepository {

    private final JdbcClient jdbc;

    public PlatformSettingsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Values of the keys starting with {@code prefix}, as JSON text, by key. */
    public Map<String, String> valuesWithPrefix(String prefix) {
        Map<String, String> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT key, value::text AS value FROM platform_settings WHERE key LIKE"
                                + " :prefix ORDER BY key")
                .param("prefix", prefix + "%")
                .query(
                        rs -> {
                            result.put(rs.getString("key"), rs.getString("value"));
                        });
        return result;
    }

    /** Locks the rows of a prefix (serialises admin writes). */
    public void lockPrefix(String prefix) {
        jdbc.sql("SELECT key FROM platform_settings WHERE key LIKE :prefix FOR UPDATE")
                .param("prefix", prefix + "%")
                .query(String.class)
                .list();
    }

    /** Stores a value (JSON text) of an existing or new key. */
    public void put(String key, String jsonValue, UUID updatedBy, Instant now) {
        jdbc.sql(
                        """
                        INSERT INTO platform_settings (key, value, updated_by, updated_at, created_at)
                        VALUES (:key, CAST(:value AS jsonb), :by, :now, :now)
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
                            updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
                        """)
                .param("key", key)
                .param("value", jsonValue)
                .param("by", updatedBy)
                .param("now", Timestamp.from(now))
                .update();
    }

    /** When and by whom the prefix was last changed (null values without admin changes). */
    public Map<String, Object> lastChange(String prefix) {
        Map<String, Object> result = new LinkedHashMap<>();
        jdbc.sql(
                        "SELECT updated_by, updated_at FROM platform_settings WHERE key LIKE"
                                + " :prefix ORDER BY updated_at DESC LIMIT 1")
                .param("prefix", prefix + "%")
                .query(
                        rs -> {
                            UUID by = rs.getObject("updated_by", UUID.class);
                            if (by != null) {
                                result.put("updatedBy", by);
                            }
                            result.put("updatedAt", rs.getTimestamp("updated_at").toInstant());
                        });
        return result;
    }
}
