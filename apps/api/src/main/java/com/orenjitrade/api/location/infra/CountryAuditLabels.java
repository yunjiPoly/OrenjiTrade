package com.orenjitrade.api.location.infra;

import com.orenjitrade.api.audit.domain.AuditTargetLabels;
import com.orenjitrade.api.location.domain.RegionCatalog;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Names a country moved between platform regions in the audit log ("Canada", spec 15.8), and the
 * regions it moved between ("Americas (North)", never {@code americas-north}: spec 15.2).
 */
@Component
public class CountryAuditLabels implements AuditTargetLabels {

    static final String TARGET_COUNTRY = "COUNTRY";

    /** The details keys of {@code region.country.update} holding a platform region code. */
    private static final List<String> REGION_KEYS = List.of("region", "previousRegion");

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

    @Override
    public Map<String, String> valueLabels(
            String targetType, Collection<Map<String, Object>> shownDetails) {
        Map<String, String> labels = new LinkedHashMap<>();
        for (Map<String, Object> details : shownDetails) {
            for (String key : REGION_KEYS) {
                if (details.get(key) instanceof String code) {
                    regions.region(code).ifPresent(region -> labels.put(code, region.name()));
                }
            }
        }
        return labels;
    }
}
