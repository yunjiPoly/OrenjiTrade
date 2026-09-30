package com.orenjitrade.api.users.domain;

import java.util.UUID;

/**
 * Extension point for the onboarding flags of {@code GET /api/v1/me}. Other modules (profiles,
 * location, games) register a bean per flag; a flag with no registered check is reported as {@code
 * false}. When several checks target the same flag, the flag is {@code true} as soon as one of them
 * is satisfied.
 */
public interface OnboardingCheck {

    /** The flag this check computes. */
    OnboardingFlag flag();

    /** Whether the step is done for {@code userId}. Must be cheap: called on every {@code /me}. */
    boolean isSatisfied(UUID userId);
}
