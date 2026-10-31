package com.orenjitrade.api.audit.domain;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.jspecify.annotations.Nullable;

/**
 * SPI through which a module names the targets of its audit entries for the admin console (spec
 * 15.8: "a readable target label on audit entries", never a raw id: "Report #1047", a card's name,
 * a room's name), so the audit module never depends on the modules it records. Records are evidence
 * and are never rewritten: a label and {@link #staffDetails} only change what a response shows.
 * Never a place: a city channel reads "An archived channel" (ADR 0017).
 */
public interface AuditTargetLabels {

    /** The target types (e.g. {@code REPORT}) this implementation names. */
    Set<String> targetTypes();

    /**
     * Readable labels of targets of one type, by target id; targets it cannot name are absent.
     *
     * @param targetType one of {@link #targetTypes()}
     * @param targets the entries' targets with their stored details
     */
    Map<String, String> labelsOf(String targetType, Collection<Target> targets);

    /**
     * The target a staff member typed in the audit log's Target search (a report number "#1047", a
     * setting key), when this implementation knows it.
     *
     * @param text the search text, trimmed and not empty
     */
    default Optional<TargetRef> resolve(String text) {
        return Optional.empty();
    }

    /**
     * The details staff may read for one entry (default: as stored). An implementation replaces
     * what may not reach staff (a city channel's slug) without touching the stored record.
     */
    default Map<String, Object> staffDetails(
            String action,
            String targetType,
            @Nullable String targetId,
            Map<String, Object> details) {
        return details;
    }

    /**
     * One audit entry's target.
     *
     * @param id the stored target id
     * @param details the stored details
     */
    record Target(String id, Map<String, Object> details) {}

    /**
     * A target found by its readable name.
     *
     * @param targetType the target type
     * @param targetId the target id
     */
    record TargetRef(String targetType, String targetId) {}
}
