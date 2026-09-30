package com.orenjitrade.api.search.domain;

import java.util.Locale;
import java.util.Optional;

/**
 * Result sections of the unified search ({@code types=cards,printings,sets,collectors,binders}).
 */
public enum SearchType {
    CARDS,
    PRINTINGS,
    SETS,
    COLLECTORS,
    BINDERS;

    /** The type named {@code value} (case-insensitive). */
    public static Optional<SearchType> parse(String value) {
        for (SearchType type : values()) {
            if (type.name().equals(value.trim().toUpperCase(Locale.ROOT))) {
                return Optional.of(type);
            }
        }
        return Optional.empty();
    }

    /** Lower-case name as used in the query string. */
    public String key() {
        return name().toLowerCase(Locale.ROOT);
    }
}
