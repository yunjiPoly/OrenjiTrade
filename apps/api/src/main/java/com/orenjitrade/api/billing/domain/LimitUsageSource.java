package com.orenjitrade.api.billing.domain;

import java.util.UUID;

/**
 * SPI for TOTAL counters whose current value is owned by another module (for example {@code
 * binders.max} = the number of binders of the user, Phase 3). When a source supports a key, {@link
 * Limits} asks it for the usage instead of counting in {@code usage_counter}, and {@link
 * Limits#consume} only checks (the owning module creates the row itself).
 */
public interface LimitUsageSource {

    /** Whether this source knows the usage of {@code limitKey}. */
    boolean supports(String limitKey);

    /** Current usage of {@code limitKey} by {@code userId}. */
    long currentUsage(UUID userId, String limitKey);
}
