package com.orenjitrade.api.limits.api;

import com.orenjitrade.api.limits.domain.LimitKind;
import com.orenjitrade.api.limits.domain.LimitWindow;
import com.orenjitrade.api.limits.domain.UsageLimitRule;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Admin view of a usage limit (the same for every collector). */
@Schema(
        name = "AdminUsageLimit",
        description = "Usage limit, the same for every collector (admin view)")
public record AdminUsageLimit(
        UUID id,
        @Schema(example = "binder.views.per_day") String key,
        LimitKind kind,
        LimitWindow window,
        @Schema(description = "null means unlimited", example = "30") @Nullable Integer maxValue,
        boolean unlimited,
        String description,
        @Nullable UUID updatedBy,
        Instant updatedAt) {

    public static AdminUsageLimit from(UsageLimitRule rule) {
        return new AdminUsageLimit(
                rule.id(),
                rule.key(),
                rule.kind(),
                rule.window(),
                rule.maxValue(),
                rule.maxValue() == null,
                rule.description(),
                rule.updatedBy(),
                rule.updatedAt());
    }
}
