package com.orenjitrade.api.users.domain;

/** The onboarding steps reported in {@code MeResponse.onboarding}. */
public enum OnboardingFlag {
    PROFILE_COMPLETE,
    TRADING_AREA_SET,
    INTERESTS_SET,
    /** The 18+ confirmation ({@code AGE_CONFIRMATION} consent) was recorded. */
    AGE_CONFIRMED
}
