package com.orenjitrade.api.users.domain;

import java.util.List;
import java.util.UUID;

/**
 * Extension point of the account deletion framework. Every module holding personal data registers
 * one bean; {@link AccountDeletionService} calls them in {@code @Order} order. All callbacks run
 * inside the caller's transaction and must be idempotent.
 */
public interface DeletionParticipant {

    /** Short name for logs and job details. */
    String name();

    /**
     * Open obligations that forbid the deletion right now (e.g. {@code OPEN_DISPUTE}, {@code
     * OPEN_TRADE}); non-empty means {@code 409 DELETION_BLOCKED}.
     */
    default List<String> blockers(UUID userId) {
        return List.of();
    }

    /**
     * The owner asked for deletion: hide the account's public traces during the grace period
     * (public inventory, map presence) without destroying anything yet.
     */
    default void onDeletionRequested(UUID userId) {}

    /**
     * The owner cancelled during the grace period: restore what {@link #onDeletionRequested} hid.
     */
    default void onDeletionCancelled(UUID userId) {}

    /**
     * The grace period is over: delete (or anonymise) every personal record of the module. The
     * account row itself, consents, audit entries and ledgers are kept by the framework.
     */
    void purge(UUID userId);
}
