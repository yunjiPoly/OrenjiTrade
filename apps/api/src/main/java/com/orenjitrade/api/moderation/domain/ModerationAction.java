package com.orenjitrade.api.moderation.domain;

/** What happens when a rule matches. */
public enum ModerationAction {
    /** Accepted but worth a moderator's attention. */
    FLAG,
    /** Rejected. */
    BLOCK
}
