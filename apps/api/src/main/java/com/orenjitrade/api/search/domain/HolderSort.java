package com.orenjitrade.api.search.domain;

import java.util.Locale;
import java.util.Optional;

/** Order of card-holder results ({@code sort=freshness|price}); no distance exists (ADR 0017). */
public enum HolderSort {
    /** Freshest listing first (ACTIVE before AGING, most recently confirmed first). */
    FRESHNESS,
    /** Cheapest asking price first (items without a price last), then freshest. */
    PRICE;

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
