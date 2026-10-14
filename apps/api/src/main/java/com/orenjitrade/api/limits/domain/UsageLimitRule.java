package com.orenjitrade.api.limits.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A usage limit ({@code usage_limit}): the same for every collector (ADR 0019).
 *
 * @param id row id (admin edits)
 * @param key limit key, e.g. {@code binder.views.per_day}
 * @param kind counter or cap
 * @param window counting window (always {@link LimitWindow#TOTAL} for caps)
 * @param maxValue the limit, {@code null} = unlimited
 * @param description human description
 * @param updatedBy last admin editor
 * @param updatedAt last change
 */
@Schema(name = "UsageLimit", description = "Usage limit (the same for every collector)")
public record UsageLimitRule(
        UUID id,
        @Schema(example = "binder.views.per_day") String key,
        LimitKind kind,
        LimitWindow window,
        @Schema(description = "The limit; null means unlimited", example = "30")
                @Nullable Integer maxValue,
        String description,
        @Nullable UUID updatedBy,
        Instant updatedAt) {}
