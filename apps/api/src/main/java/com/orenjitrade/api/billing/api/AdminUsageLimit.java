package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.billing.domain.LimitKind;
import com.orenjitrade.api.billing.domain.LimitWindow;
import com.orenjitrade.api.billing.domain.UsageLimitRule;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** Admin view of a usage limit with its plan. */
@Schema(name = "AdminUsageLimit", description = "Usage limit of a plan (admin view)")
public record AdminUsageLimit(
        UUID id,
        @Schema(example = "FREE") String planCode,
        @Schema(example = "binder.views.per_day") String key,
        LimitKind kind,
        LimitWindow window,
        @Schema(description = "null means unlimited", example = "30") @Nullable Integer maxValue,
        boolean unlimited,
        String description,
        @Nullable UUID updatedBy,
        Instant updatedAt) {

    public static AdminUsageLimit from(String planCode, UsageLimitRule rule) {
        return new AdminUsageLimit(
                rule.id(),
                planCode,
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
