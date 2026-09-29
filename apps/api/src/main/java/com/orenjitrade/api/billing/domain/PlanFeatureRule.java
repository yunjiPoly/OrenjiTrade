package com.orenjitrade.api.billing.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import org.jspecify.annotations.Nullable;

/**
 * A feature switch of a plan ({@code plan_feature}).
 *
 * @param key feature key, e.g. {@code filters.advanced}
 * @param enabled whether the plan includes the feature
 * @param value optional parameter of the feature
 */
@Schema(name = "PlanFeature", description = "Feature switch of a plan")
public record PlanFeatureRule(
        @Schema(example = "filters.advanced") String key,
        boolean enabled,
        @Nullable String value) {}
