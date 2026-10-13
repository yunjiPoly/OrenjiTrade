package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.profiles.domain.RatingSummary;
import java.util.Comparator;
import java.util.function.Function;

/**
 * Ranking of collectors in discovery results: freshness of the public listings first (ACTIVE, then
 * AGING, then collectors without listings), then rating, then handle. No distance exists (ADR
 * 0017). The SQL orders by the same keys except the rating, which is applied here.
 */
public final class MarkerRanking {

    /** Freshness rank of collectors without public listings. */
    public static final int NO_LISTINGS_RANK = 2;

    private MarkerRanking() {}

    /** The comparator, given how to read the rating of a row. */
    public static Comparator<MarkerRow> comparator(Function<MarkerRow, RatingSummary> ratings) {
        return Comparator.<MarkerRow>comparingInt(MarkerRanking::freshnessKey)
                .thenComparing(
                        row -> ratings.apply(row).average(),
                        Comparator.nullsLast(Comparator.<Double>reverseOrder()))
                .thenComparing(
                        row -> ratings.apply(row).count(), Comparator.<Integer>reverseOrder())
                .thenComparing(MarkerRow::handle);
    }

    static int freshnessKey(MarkerRow row) {
        Integer rank = row.freshnessRank();
        return rank == null ? NO_LISTINGS_RANK : rank;
    }
}
