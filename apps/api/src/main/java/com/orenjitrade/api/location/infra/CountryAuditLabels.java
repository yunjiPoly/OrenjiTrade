package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import com.orenjitrade.api.location.domain.RegionCatalog;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/** Names a country moved between platform regions in the audit log ("Canada", spec 15.8). */
@Component
public class CountryAuditLabels implements AuditTargetLabels {

    static final String TARGET_COUNTRY = "COUNTRY";

    private final RegionCatalog regions;

    public CountryAuditLabels(RegionCatalog regions) {
        this.regions = regions;
    }

    @Override
    public Set<String> targetTypes() {
        return Set.of(TARGET_COUNTRY);
    }

    @Override
    public Map<String, String> labelsOf(String targetType, Collection<Target> targets) {
        Map<String, String> labels = new LinkedHashMap<>();
        for (Target target : targets) {
            regions.country(target.id())
                    .ifPresent(country -> labels.put(target.id(), country.name()));
        }
        return labels;
    }
}
