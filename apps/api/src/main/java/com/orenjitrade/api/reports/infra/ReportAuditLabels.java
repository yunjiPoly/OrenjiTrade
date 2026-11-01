package com.orenjitrade.api.reports.infra;

import com.orenjitrade.api.audit.domain.AuditLabelIds;
import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Names a report in the audit log by its number ("Report #1047", spec 15.8), and finds a report
 * typed as "#1047" in the audit log's Target search (web stage WH2).
 */
@Component
public class ReportAuditLabels implements AuditTargetLabels {

    static final String TARGET_REPORT = "REPORT";

    private static final Pattern NUMBER = Pattern.compile("^#?\\s*(\\d{1,12})$");

    private final JdbcClient jdbc;

    public ReportAuditLabels(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_REPORT);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        List<UUID> ids = AuditLabelIds.uuids(targets);
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<String, String> labels = new LinkedHashMap<>();
        jdbc.sql("SELECT id, report_number FROM collector_report WHERE id IN (:ids)")
                .param("ids", ids)
                .query(
                        (rs, rowNum) ->
                                labels.put(
                                        rs.getObject("id", UUID.class).toString(),
                                        "Report #" + rs.getLong("report_number")))
                .list();
        return labels;
    }

    @Override
    public Optional<TargetRef> resolve(String text) {
        Matcher matcher = NUMBER.matcher(text);
        if (!matcher.matches()) {
            return Optional.empty();
        }
        long number = Long.parseLong(matcher.group(1));
        return jdbc.sql("SELECT id FROM collector_report WHERE report_number = :number")
                .param("number", number)
                .query(UUID.class)
                .optional()
                .map(id -> new TargetRef(TARGET_REPORT, id.toString()));
    }
}
