package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.billing.domain.LimitKind;
import com.orenjitrade.api.billing.domain.LimitWindow;
import com.orenjitrade.api.billing.domain.PlanFeatureRule;
import com.orenjitrade.api.billing.domain.PlanRules;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** Public view of a plan ({@code GET /plans}, {@code GET /me/plan}). */
@Schema(name = "Plan", description = "Subscription plan with its features and limits")
public record PlanResponse(
        @Schema(example = "PREMIUM") String code,
        @Schema(example = "Premium") String name,
        String description,
        @Schema(example = "4.99") BigDecimal monthlyPrice,
        @Schema(example = "CAD") String currency,
        List<PlanFeatureRule> features,
        List<PlanLimit> limits) {

    public static PlanResponse from(PlanRules plan) {
        return new PlanResponse(
                plan.code(),
                plan.name(),
                plan.description(),
                plan.monthlyPrice(),
                plan.currency(),
                plan.features(),
                plan.limits().stream()
                        .map(
                                limit ->
                                        new PlanLimit(
                                                limit.key(),
                                                limit.kind(),
                                                limit.window(),
                                                limit.maxValue(),
                                                limit.description()))
                        .toList());
    }

    /**
     * A limit of a plan.
     *
     * @param key limit key
     * @param kind counter or cap
     * @param window counting window
     * @param limit the value, {@code null} = unlimited
     * @param description human description
     */
    @Schema(name = "PlanLimit", description = "Usage limit of a plan")
    public record PlanLimit(
            @Schema(example = "binder.views.per_day") String key,
            LimitKind kind,
            LimitWindow window,
            @Schema(description = "null means unlimited", example = "30") @Nullable Integer limit,
            String description) {}
}
