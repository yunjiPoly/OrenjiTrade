package com.orenjitrade.api.featureflags.domain;

/**
 * Keys of the flags created by the migrations ({@code V010__feature_flags.sql}). Values are data
 * (ADR 0014); only the names are code.
 */
public final class FeatureFlagKeys {

    /** Camera card scanning (Phase 11; kept off by owner decision). */
    public static final String ML_SCANNING = "mlScanning";

    /** Protected payments, shipping and disputes (Phase 9). */
    public static final String PROTECTED_PAYMENTS = "protectedPayments";

    /** Public community channels (Phase 5). */
    public static final String PUBLIC_CHAT = "publicChat";

    /** Premium plans marketing and checkout (Phase 10). */
    public static final String PREMIUM_PLANS = "premiumPlans";

    /** Internal sponsored placements (Phase 10). */
    public static final String ADVERTISING = "advertising";

    /** Credits ledger (Phase 10). */
    public static final String CREDITS = "credits";

    /** Voluntary donations (Phase 10). */
    public static final String DONATIONS = "donations";

    private FeatureFlagKeys() {}
}
