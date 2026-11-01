package com.orenjitrade.api.moderation.infra;

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
 * Names moderation flags and rules in the audit log (spec 15.8): a flag by what raised it ("Unusual
 * posting rate"), a rule by its kind and pattern ("Banned term: free\\s*cards"); a deleted rule by
 * the values its audit entry kept.
 */
@Component
public class ModerationAuditLabels implements AuditTargetLabels {

    static final String TARGET_FLAG = "MODERATION_FLAG";
    static final String TARGET_RULE = "MODERATION_RULE";
    private static final int PATTERN_MAX = 40;

    private final JdbcClient jdbc;

    public ModerationAuditLabels(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_FLAG, TARGET_RULE);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        List<UUID> ids = AuditLabelIds.uuids(targets);
        Map<String, String> labels = new LinkedHashMap<>();
        if (!ids.isEmpty() && TARGET_FLAG.equals(targetType)) {
            jdbc.sql("SELECT id, reason FROM moderation_flag WHERE id IN (:ids)")
                    .param("ids", ids)
                    .query(
                            (rs, rowNum) ->
                                    labels.put(
                                            rs.getObject("id", UUID.class).toString(),
                                            reasonLabel(rs.getString("reason"))))
                    .list();
        } else if (!ids.isEmpty()) {
            jdbc.sql("SELECT id, kind, pattern FROM moderation_rule WHERE id IN (:ids)")
                    .param("ids", ids)
                    .query(
                            (rs, rowNum) ->
                                    labels.put(
                                            rs.getObject("id", UUID.class).toString(),
                                            ruleLabel(
                                                    rs.getString("kind"), rs.getString("pattern"))))
                    .list();
            for (Target target : targets) {
                if (!labels.containsKey(target.id())
                        && target.details().get("rule") instanceof Map<?, ?> kept) {
                    labels.put(
                            target.id(),
                            ruleLabel(text(kept.get("kind")), text(kept.get("pattern"))));
                }
            }
        }
        return labels;
    }

    /** What raised a flag, in words. */
    static String reasonLabel(@Nullable String reason) {
        return switch (reason == null ? "" : reason) {
            case "BANNED_TERM" -> "Banned term";
            case "RATE_THRESHOLD" -> "Unusual posting rate";
            case "REPEATED_CONTENT" -> "Repeated content";
            default -> "Moderation flag";
        };
    }

    /** A rule by its kind and (shortened) pattern. */
    static String ruleLabel(@Nullable String kind, @Nullable String pattern) {
        String words =
                switch (kind == null ? "" : kind) {
                    case "BANNED_TERM" -> "Banned term";
                    case "RATE_LIMIT" -> "Rate limit";
                    case "THRESHOLD" -> "Repeated content";
                    case "REPORT_THRESHOLD" -> "Report threshold";
                    default -> "Moderation rule";
                };
        if (pattern == null || pattern.isBlank()) {
            return words;
        }
        String shown =
                pattern.length() > PATTERN_MAX ? pattern.substring(0, PATTERN_MAX) + "…" : pattern;
        return words + ": " + shown;
    }

    private static @Nullable String text(@Nullable Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
