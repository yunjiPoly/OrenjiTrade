package com.orenjitrade.api.moderation.domain;

/** Outcome of {@link TextModerationService#evaluate}; the strictest matching rule wins. */
public enum ModerationVerdict {
    ALLOW,
    FLAG,
    BLOCK;

    public boolean isBlocked() {
        return this == BLOCK;
    }
}
