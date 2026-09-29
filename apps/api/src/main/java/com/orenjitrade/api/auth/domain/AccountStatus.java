package com.orenjitrade.api.auth.domain;

/** Lifecycle state of a user account ({@code user_account.status}). */
public enum AccountStatus {
    ACTIVE,
    SUSPENDED,
    /** The owner asked for deletion; only {@code GET /me} and the deletion endpoints work. */
    DELETION_REQUESTED,
    /** Anonymised by the deletion job; the identity-provider user no longer exists. */
    DELETED
}
