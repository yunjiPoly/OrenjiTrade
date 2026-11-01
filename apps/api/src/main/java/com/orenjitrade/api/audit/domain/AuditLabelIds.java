package com.orenjitrade.api.audit.domain;

import com.orenjitrade.api.audit.domain.AuditTargetLabels.Target;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Helpers of the {@link AuditTargetLabels} implementations. */
public final class AuditLabelIds {

    private AuditLabelIds() {}

    /** The targets' ids that are UUIDs, once each (others are skipped). */
    public static List<UUID> uuids(Collection<Target> targets) {
        Set<UUID> ids = new LinkedHashSet<>();
        for (Target target : targets) {
            try {
                ids.add(UUID.fromString(target.id()));
            } catch (IllegalArgumentException e) {
                // Not a UUID: nothing to look up.
            }
        }
        return new ArrayList<>(ids);
    }

    /** The targets' ids as given, once each. */
    public static List<String> ids(Collection<Target> targets) {
        return List.copyOf(new LinkedHashSet<>(targets.stream().map(Target::id).toList()));
    }
}
