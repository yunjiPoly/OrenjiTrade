package com.orenjitrade.api.users.domain;

/**
 * Plan codes stored in {@code user_account.plan_code}, a foreign key to {@code plan.code} since
 * V011. Plans, their features and limits are configurable data owned by the billing module; these
 * constants only name the two plans every environment has.
 */
public final class PlanCode {

    public static final String FREE = "FREE";
    public static final String PREMIUM = "PREMIUM";

    private PlanCode() {}
}
