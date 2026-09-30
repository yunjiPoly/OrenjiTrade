package com.orenjitrade.api.users.domain;

/** {@code account_deletion_request.status}. */
public enum DeletionRequestStatus {
    /** Grace period running; the owner may cancel. */
    PENDING,
    /** Reserved for a multi-step job; the current job completes in one transaction. */
    PROCESSING,
    /** Account anonymised and module data purged. */
    COMPLETED,
    /** Cancelled by the owner during the grace period. */
    CANCELLED
}
