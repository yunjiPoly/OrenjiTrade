package com.orenjitrade.api.users.domain;

import java.util.Locale;
import java.util.Optional;
import org.jspecify.annotations.Nullable;

/**
 * Rules for a handle chosen by a collector (Phase 1 contract, "Profile"): 3 to 24 characters of
 * {@code [a-z0-9_]} after trimming and lower-casing, not on the {@link ReservedHandles} list and
 * not starting with {@value #ANONYMISED_PREFIX} (used by anonymised accounts). Uniqueness
 * (case-insensitive) is checked against the database by {@link UserAccountService#changeHandle}.
 */
public final class HandleRules {

    /** Prefix of the handles of anonymised (deleted) accounts. */
    public static final String ANONYMISED_PREFIX = "deleted_";

    /** Why a handle is refused. */
    public enum Violation {
        /** Not 3-24 characters of {@code [a-z0-9_]}: {@code 400 VALIDATION_FAILED}. */
        INVALID_FORMAT,
        /** Reserved word or prefix: {@code 409 HANDLE_TAKEN}. */
        RESERVED
    }

    private HandleRules() {}

    /** Trims and lower-cases user input ({@code " Maika_QC "} becomes {@code "maika_qc"}). */
    public static String normalise(@Nullable String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    /** The first rule a normalised handle breaks, if any (uniqueness excluded). */
    public static Optional<Violation> check(String normalised) {
        if (!HandleGenerator.isValid(normalised)) {
            return Optional.of(Violation.INVALID_FORMAT);
        }
        if (ReservedHandles.isReserved(normalised) || normalised.startsWith(ANONYMISED_PREFIX)) {
            return Optional.of(Violation.RESERVED);
        }
        return Optional.empty();
    }
}
