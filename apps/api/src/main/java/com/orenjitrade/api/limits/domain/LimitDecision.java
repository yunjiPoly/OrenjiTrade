package com.orenjitrade.api.limits.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Outcome of {@link Limits#check}, {@link Limits#consume} or {@link Limits#checkValue}; also the
 * per-limit status of {@code GET /me/limits}. The limit is the same for every collector (ADR 0019).
 *
 * @param key the limit key
 * @param allowed whether the action may proceed
 * @param kind counter or cap
 * @param window counting window
 * @param limit the limit, {@code null} = unlimited
 * @param used consumption in the current window (counters), the requested value (caps checked with
 *     a value), {@code null} for a cap without a requested value
 * @param remaining what is left in the window, {@code null} when unlimited or for caps
 * @param resetsAt end of the current window, {@code null} for TOTAL windows and caps
 */
@Schema(
        name = "LimitStatus",
        description = "A usage limit (the same for every collector) with the caller's usage")
public record LimitDecision(
        @Schema(example = "binder.views.per_day") String key,
        boolean allowed,
        LimitKind kind,
        LimitWindow window,
        @Schema(description = "The limit; null means unlimited", example = "30")
                @Nullable Integer limit,
        @Schema(example = "12") @Nullable Long used,
        @Schema(example = "18") @Nullable Long remaining,
        @Nullable Instant resetsAt) {}
