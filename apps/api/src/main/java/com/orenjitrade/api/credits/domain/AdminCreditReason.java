package com.orenjitrade.api.credits.domain;

/** Reasons an admin may give to a grant or an adjustment ({@code credit_ledger_entry.reason}). */
public enum AdminCreditReason {
    /** Goodwill or support gesture. */
    ADMIN,
    /** Promotion or event. */
    PROMO,
    /** Reward for a contribution (e.g. a helpful report). */
    REWARD,
    /** Correction of an earlier entry. */
    CORRECTION
}
