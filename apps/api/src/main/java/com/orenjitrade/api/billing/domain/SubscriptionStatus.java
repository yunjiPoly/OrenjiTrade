package com.orenjitrade.api.billing.domain;

import java.util.EnumSet;
import java.util.Set;

/** Status of a subscription ({@code subscription.status}). */
public enum SubscriptionStatus {
    /** A checkout is open at the provider; nothing is paid yet. */
    PENDING,
    TRIAL,
    ACTIVE,
    /** A renewal payment failed; the plan stays during the grace period. */
    PAST_DUE,
    CANCELLED,
    EXPIRED;

    /** At most one subscription of an account is in one of these states. */
    public static final Set<SubscriptionStatus> LIVE = EnumSet.of(PENDING, TRIAL, ACTIVE, PAST_DUE);

    /** States that grant the plan. */
    public static final Set<SubscriptionStatus> ENTITLING = EnumSet.of(TRIAL, ACTIVE, PAST_DUE);

    public boolean live() {
        return LIVE.contains(this);
    }

    public boolean entitling() {
        return ENTITLING.contains(this);
    }
}
