package com.orenjitrade.api.billing.domain;

/** Origin of an entitlement ({@code entitlement.source}). */
public enum EntitlementSource {
    SUBSCRIPTION,
    ADMIN_GRANT,
    PROMO,
    CREDIT_PURCHASE
}
