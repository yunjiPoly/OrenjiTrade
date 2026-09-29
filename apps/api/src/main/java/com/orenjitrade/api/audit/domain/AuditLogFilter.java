package com.orenjitrade.api.audit.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Optional filters of an audit-log query; every field may be {@code null}. */
public record AuditLogFilter(
        @Nullable UUID actorId,
        @Nullable String targetType,
        @Nullable String targetId,
        @Nullable String action,
        @Nullable Instant from,
        @Nullable Instant to) {

    public static AuditLogFilter none() {
        return new AuditLogFilter(null, null, null, null, null, null);
    }
}
