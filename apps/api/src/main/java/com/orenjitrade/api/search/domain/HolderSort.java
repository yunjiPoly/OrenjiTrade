package com.orenjitrade.api.search.domain;

import java.util.Locale;
import java.util.Optional;

/**
 * Order of card-holder results ({@code sort=freshness|price|province}); no distance exists (ADR
 * 0017).
 */
public enum HolderSort {
    /** Freshest listing first (ACTIVE before AGING, most recently confirmed first). */
    FRESHNESS,
    /** Cheapest asking price first (items without a price last), then freshest. */
    PRICE,
    /**
     * Grouped by state or province (stage R5, "Who has this card"): the viewer's own province
     * first, then the other provinces of the viewer's country, then the rest of the region (by
     * country name, then province name; see {@link ProvinceOrder}), freshest listing first inside a
     * province.
     */
    PROVINCE;

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
