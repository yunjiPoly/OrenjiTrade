package com.orenjitrade.api.inventory.infra;

import com.orenjitrade.api.audit.domain.AuditLabelIds;
import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Names a listed card in the audit log by its card's name (spec 15.8). */
@Component
public class InventoryAuditLabels implements AuditTargetLabels {

    static final String TARGET_ITEM = "INVENTORY_ITEM";

    private final JdbcClient jdbc;

    public InventoryAuditLabels(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_ITEM);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        List<UUID> ids = AuditLabelIds.uuids(targets);
        if (ids.isEmpty()) {
            return Map.of();
        }
        String sql =
                "SELECT i.id, c.name AS label FROM inventory_item i JOIN card_printing p ON p.id ="
                        + " i.printing_id JOIN card c ON c.id = p.card_id WHERE i.id IN (:ids)";
        Map<String, String> labels = new LinkedHashMap<>();
        jdbc.sql(sql)
                .param("ids", ids)
                .query(
                        (rs, rowNum) ->
                                labels.put(
                                        rs.getObject("id", UUID.class).toString(),
                                        rs.getString("label")))
                .list();
        return labels;
    }
}
