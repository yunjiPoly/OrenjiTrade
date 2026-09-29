package com.orenjitrade.api.billing.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * A plan with its features and limits, as cached by {@link PlanService} (ADR 0014). Also the admin
 * view of a plan.
 *
 * @param id plan id
 * @param code plan code (FREE, PREMIUM, ...)
 * @param name display name
 * @param description marketing description
 * @param monthlyPrice display price
 * @param currency ISO 4217 code
 * @param active whether users can be on / buy the plan
 * @param sortOrder display order
 * @param features feature switches, by key
 * @param limits usage limits, by key
 * @param updatedBy last admin editor
 * @param updatedAt last change
 */
@Schema(name = "AdminPlan", description = "Plan with features and limits (admin view)")
public record PlanRules(
        UUID id,
        @Schema(example = "FREE") String code,
        String name,
        String description,
        @Schema(example = "4.99") BigDecimal monthlyPrice,
        @Schema(example = "CAD") String currency,
        boolean active,
        int sortOrder,
        List<PlanFeatureRule> features,
        List<UsageLimitRule> limits,
        @Nullable UUID updatedBy,
        Instant updatedAt) {

    public PlanRules {
        features = List.copyOf(features);
        limits = List.copyOf(limits);
    }

    public Optional<UsageLimitRule> limit(String key) {
        return limits.stream().filter(limit -> limit.key().equals(key)).findFirst();
    }

    public Optional<PlanFeatureRule> feature(String key) {
        return features.stream().filter(feature -> feature.key().equals(key)).findFirst();
    }
}
