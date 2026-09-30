package com.orenjitrade.api.billing.domain;

/** How a usage limit is enforced ({@code usage_limit.kind}). */
public enum LimitKind {
    /** Consumption counted per window ({@code Limits.consume}). */
    COUNTER,
    /** Upper bound of a requested value, never counted ({@code Limits.checkValue}). */
    CAP
}
