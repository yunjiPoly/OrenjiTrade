package com.orenjitrade.api.users.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** The onboarding block of {@code MeResponse}. */
@Schema(name = "OnboardingStatus", description = "Which onboarding steps the user completed")
public record OnboardingStatus(
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean profileComplete,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean tradingAreaSet,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean interestsSet,
        @Schema(
                        requiredMode = RequiredMode.NOT_REQUIRED,
                        description =
                                "Whether the collector confirmed being 18 years of age or older"
                                        + " (AGE_CONFIRMATION consent). Added 2026-10-05; optional"
                                        + " so older clients keep working.")
                boolean ageConfirmed) {

    public static final OnboardingStatus NONE = new OnboardingStatus(false, false, false, false);
}
