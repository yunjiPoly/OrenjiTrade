package com.orenjitrade.api.moderation.domain;

/** Where a moderation rule applies. */
public enum ModerationScope {
    MESSAGE,
    POST,
    TAG,
    PROFILE,
    /** Collector reports (Phase 7): RATE_LIMIT per reporter and REPORT_THRESHOLD rules. */
    REPORT
}
