package com.orenjitrade.api.billing.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Outcome of {@link Limits#check}, {@link Limits#consume} or {@link Limits#checkValue}; also the
 * per-limit status of {@code GET /me/plan}.
 *
 * @param key the limit key
 * @param allowed whether the action may proceed
 * @param kind counter or cap
 * @param window counting window
 * @param limit effective limit, {@code null} = unlimited
 * @param used consumption in the current window (counters), the requested value (caps checked with
 *     a value), {@code null} for a cap without a requested value
 * @param remaining what is left in the window, {@code null} when unlimited or for caps
 * @param resetsAt end of the current window, {@code null} for TOTAL windows and caps
 * @param planCode the caller's plan
 * @param overridden whether an entitlement replaced the plan value
 * @param upgradeUrl where to send the user to upgrade
 */
@Schema(name = "LimitStatus", description = "Effective usage limit of the caller")
public record LimitDecision(
        @Schema(example = "binder.views.per_day") String key,
        boolean allowed,
        LimitKind kind,
        LimitWindow window,
        @Schema(description = "Effective limit; null means unlimited", example = "30")
                @Nullable Integer limit,
        @Schema(example = "12") @Nullable Long used,
        @Schema(example = "18") @Nullable Long remaining,
        @Nullable Instant resetsAt,
        @Schema(example = "FREE") String planCode,
        boolean overridden,
        @Schema(example = "/premium") String upgradeUrl) {}
