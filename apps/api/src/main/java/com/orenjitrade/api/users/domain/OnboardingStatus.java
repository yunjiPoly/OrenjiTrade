package com.orenjitrade.api.users.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** The onboarding block of {@code MeResponse}. */
@Schema(name = "OnboardingStatus", description = "Which onboarding steps the user completed")
public record OnboardingStatus(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean profileComplete,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean tradingAreaSet,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean interestsSet) {

    public static final OnboardingStatus NONE = new OnboardingStatus(false, false, false);
}
