package com.orenjitrade.api.billing.domain;

/** Codes of the plans created by {@code V011__plans_limits.sql}. */
public final class PlanCodes {

    /** Fallback for unknown or inactive plan codes. */
    public static final String FREE = "FREE";

    public static final String PREMIUM = "PREMIUM";

    /** Where clients send users who hit a limit. */
    public static final String UPGRADE_URL = "/premium";

    private PlanCodes() {}
}
