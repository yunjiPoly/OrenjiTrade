package com.orenjitrade.api.audit.domain;

import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Optional filters of an audit-log query; every field may be {@code null}.
 *
 * @param actorId the acting account
 * @param targetType the target type
 * @param targetId the target id
 * @param action the exact action
 * @param from lower bound (inclusive)
 * @param to upper bound (exclusive)
 * @param actorType who acted: staff ({@link ActorType#ADMIN}), a collector ({@link ActorType#USER})
 *     or {@link ActorType#SYSTEM} (web stage WH2's "Who")
 */
public record AuditLogFilter(
        @Nullable UUID actorId,
        @Nullable String targetType,
        @Nullable String targetId,
        @Nullable String action,
        @Nullable Instant from,
        @Nullable Instant to,
        @Nullable ActorType actorType) {

    public AuditLogFilter(
            @Nullable UUID actorId,
            @Nullable String targetType,
            @Nullable String targetId,
            @Nullable String action,
            @Nullable Instant from,
            @Nullable Instant to) {
        this(actorId, targetType, targetId, action, from, to, null);
    }

    public static AuditLogFilter none() {
        return new AuditLogFilter(null, null, null, null, null, null, null);
    }

    /** The same filter on one target. */
    public AuditLogFilter onTarget(String type, String id) {
        return new AuditLogFilter(actorId, type, id, action, from, to, actorType);
    }
}
