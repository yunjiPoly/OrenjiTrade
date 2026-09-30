package com.orenjitrade.api.search.domain;

import java.util.Locale;
import java.util.Optional;

/** Order of card-holder results ({@code sort=distance|price|freshness}). */
public enum HolderSort {
    /** Closest first (then fresher, then cheaper). */
    DISTANCE,
    /** Cheapest asking price first (items without a price last), then closest. */
    PRICE,
    /** Most recently confirmed first, then closest. */
    FRESHNESS;

    /** The sort named {@code value} (case-insensitive). */
    public static Optional<HolderSort> parse(String value) {
        for (HolderSort sort : values()) {
            if (sort.name().equals(value.trim().toUpperCase(Locale.ROOT))) {
                return Optional.of(sort);
            }
        }
        return Optional.empty();
    }
}
