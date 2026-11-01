package com.orenjitrade.api.limits.infra;

import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import com.orenjitrade.api.limits.domain.UsageLimitRule;
import com.orenjitrade.api.limits.domain.UsageLimitService;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Names a usage limit in the audit log by its key ("binder.views.per_day", spec 15.8), and finds
 * one typed by its key in the audit log's Target search (web stage WH2).
 */
@Component
public class UsageLimitAuditLabels implements AuditTargetLabels {

    static final String TARGET_USAGE_LIMIT = "USAGE_LIMIT";

    private final UsageLimitService limits;

    public UsageLimitAuditLabels(UsageLimitService limits) {
        this.limits = limits;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_USAGE_LIMIT);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        Map<String, String> keys = new LinkedHashMap<>();
        for (UsageLimitRule rule : limits.all()) {
            keys.put(rule.id().toString(), rule.key());
        }
        Map<String, String> labels = new LinkedHashMap<>();
        for (Target target : targets) {
            String key = keys.get(target.id());
            if (key != null) {
                labels.put(target.id(), key);
            }
        }
        return labels;
    }

    @Override
    public Optional<TargetRef> resolve(String text) {
        return limits.find(text)
                .map(rule -> new TargetRef(TARGET_USAGE_LIMIT, rule.id().toString()));
    }
}
