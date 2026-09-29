package com.orenjitrade.api.delisting.infra;

import com.orenjitrade.api.delisting.domain.FreshnessEventLog.Entry;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** {@code inventory_freshness_event} access (append-only). */
@Repository
public class FreshnessEventRepository {

    private final JdbcClient jdbc;

    public FreshnessEventRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(Entry entry) {
        jdbc.sql(
                        """
                        INSERT INTO inventory_freshness_event (id, owner_id, item_id, binder_id, event,
                            created_at)
                        VALUES (:id, :ownerId, :itemId, :binderId, :event, :at)
                        """)
                .param("id", UUID.randomUUID())
                .param("ownerId", entry.ownerId())
                .param("itemId", entry.itemId(), java.sql.Types.OTHER)
                .param("binderId", entry.binderId(), java.sql.Types.OTHER)
                .param("event", entry.type().name())
                .param("at", Timestamp.from(entry.at()))
                .update();
    }

    /** Event names of an item or binder, oldest first (tests, admin views). */
    public List<String> eventsOf(UUID targetId) {
        return jdbc.sql(
                        """
                        SELECT event FROM inventory_freshness_event
                         WHERE item_id = :id OR binder_id = :id
                         ORDER BY created_at, id
                        """)
                .param("id", targetId)
                .query(String.class)
                .list();
    }
}
