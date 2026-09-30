package com.orenjitrade.api.moderation.domain;

/**
 * {@code moderation_rule.kind}: banned terms (regular expressions), per-author rate limits,
 * repeated-content thresholds and (Phase 7) the open-report threshold of collector reports.
 */
public enum ModerationRuleKind {
    BANNED_TERM,
    RATE_LIMIT,
    THRESHOLD,
    /**
     * {@code <count>/<seconds>}: that many open reports from distinct reporters within the window
     * flag the reported account; action BLOCK also pauses their public listings pending review.
     */
    REPORT_THRESHOLD
}
