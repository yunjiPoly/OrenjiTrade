package com.orenjitrade.api.users.domain;

import java.util.function.BooleanSupplier;

/**
 * Whether a collector could save a handle (stage R12, the welcome step "Who are you?" checks it
 * while the collector types). The same rules as {@link UserAccountService#changeHandle}: a handle
 * that answers {@link #AVAILABLE} or {@link #CURRENT} saves, {@link #TAKEN} is a {@code 409
 * HANDLE_TAKEN} and {@link #INVALID} a {@code 400 VALIDATION_FAILED}. A reserved handle reads
 * {@link #TAKEN}, as the save says, so the answer never tells a reserved word from a used one.
 */
public enum HandleAvailability {
    /** Free: nobody holds it and it is not reserved. */
    AVAILABLE,
    /** The caller's own handle (always kept, even a reserved one a seed staff account holds). */
    CURRENT,
    /** Held by another account (case-insensitive) or reserved. */
    TAKEN,
    /** Not 3 to 24 characters of {@code [a-z0-9_]} after trimming and lower-casing. */
    INVALID;

    /** Whether saving the handle would succeed. */
    public boolean available() {
        return this == AVAILABLE || this == CURRENT;
    }

    /**
     * The answer for a normalised handle ({@link HandleRules#normalise}). {@code takenByAnother} is
     * only asked for a well-formed, unreserved handle that is not the caller's own, so a malformed
     * or reserved one never reaches the database.
     */
    public static HandleAvailability of(
            String normalised, String currentHandle, BooleanSupplier takenByAnother) {
        HandleRules.Violation violation = HandleRules.check(normalised).orElse(null);
        if (violation == HandleRules.Violation.INVALID_FORMAT) {
            return INVALID;
        }
        if (normalised.equals(currentHandle)) {
            return CURRENT;
        }
        if (violation == HandleRules.Violation.RESERVED || takenByAnother.getAsBoolean()) {
            return TAKEN;
        }
        return AVAILABLE;
    }
}
