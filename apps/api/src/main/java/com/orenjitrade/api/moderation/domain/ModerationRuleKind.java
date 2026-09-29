package com.orenjitrade.api.moderation.domain;

/** {@code moderation_rule.kind}. Only {@link #BANNED_TERM} is evaluated so far. */
public enum ModerationRuleKind {
    BANNED_TERM,
    RATE_LIMIT,
    THRESHOLD
}
