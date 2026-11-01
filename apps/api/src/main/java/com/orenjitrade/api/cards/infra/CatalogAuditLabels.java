package com.orenjitrade.api.cards.infra;

import com.orenjitrade.api.audit.domain.AuditLabelIds;
import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Names catalog rows in the audit log (spec 15.8): a card by its name, a printing by its card and
 * code ("Ash Blossom & Joyous Spring · MACR-EN036"), a set by its name.
 */
@Component
public class CatalogAuditLabels implements AuditTargetLabels {

    static final String TARGET_CARD = "CARD";
    static final String TARGET_PRINTING = "CARD_PRINTING";
    static final String TARGET_SET = "CARD_SET";

    private final JdbcClient jdbc;

    public CatalogAuditLabels(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_CARD, TARGET_PRINTING, TARGET_SET);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        List<UUID> ids = AuditLabelIds.uuids(targets);
        if (ids.isEmpty()) {
            return Map.of();
        }
        String sql =
                switch (targetType) {
                    case TARGET_CARD -> "SELECT id, name AS label FROM card WHERE id IN (:ids)";
                    case TARGET_SET -> "SELECT id, name AS label FROM card_set WHERE id IN (:ids)";
                    default ->
                            "SELECT p.id, c.name AS label, coalesce(p.printing_code, s.code || ' '"
                                    + " || p.collector_number) AS code FROM card_printing p JOIN"
                                    + " card c ON c.id = p.card_id JOIN card_set s ON s.id ="
                                    + " p.set_id WHERE p.id IN (:ids)";
                };
        boolean printing = TARGET_PRINTING.equals(targetType);
        Map<String, String> labels = new LinkedHashMap<>();
        jdbc.sql(sql)
                .param("ids", ids)
                .query(
                        (rs, rowNum) -> {
                            String label = rs.getString("label");
                            @Nullable String code = printing ? rs.getString("code") : null;
                            return labels.put(
                                    rs.getObject("id", UUID.class).toString(),
                                    code == null ? label : label + " · " + code);
                        })
                .list();
        return labels;
    }
}
