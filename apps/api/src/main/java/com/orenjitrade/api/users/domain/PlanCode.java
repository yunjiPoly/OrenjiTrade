package com.orenjitrade.api.users.domain;

/**
 * Plan codes stored in {@code user_account.plan_code}. Plans become a configurable table in Phase
 * 10; until then only these two codes exist and the column stays a plain {@code text}.
 */
public final class PlanCode {

    public static final String FREE = "FREE";
    public static final String PREMIUM = "PREMIUM";

    private PlanCode() {}
}
