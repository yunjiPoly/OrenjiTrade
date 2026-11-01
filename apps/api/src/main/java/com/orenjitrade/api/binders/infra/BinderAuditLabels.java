package com.orenjitrade.api.binders.infra;

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

/** Names binders in the audit log by their name (spec 15.8). */
@Component
public class BinderAuditLabels implements AuditTargetLabels {

    static final String TARGET_BINDER = "BINDER";

    private final JdbcClient jdbc;

    public BinderAuditLabels(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_BINDER);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        List<UUID> ids = AuditLabelIds.uuids(targets);
        if (ids.isEmpty()) {
            return Map.of();
        }
        String sql = "SELECT id, name AS label FROM binder WHERE id IN (:ids)";
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
