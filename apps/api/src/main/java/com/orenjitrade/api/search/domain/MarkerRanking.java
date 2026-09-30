package com.orenjitrade.api.search.domain;

import com.orenjitrade.api.location.domain.DistanceBucket;
import com.orenjitrade.api.profiles.domain.RatingSummary;
import java.util.Comparator;
import java.util.function.Function;
import org.jspecify.annotations.Nullable;

/**
 * Ranking of map markers (Phase 4 contract): freshness of the public listings first (ACTIVE, then
 * AGING, then collectors without listings), then distance, then rating. Distance is compared by
 * {@link DistanceBucket} first so that the rating decides between collectors at a similar distance,
 * and by exact distance last; collectors without a distance (no search centre) sort after those
 * with one. The SQL orders by the same keys except the rating, which is applied here.
 */
public final class MarkerRanking {

    /** Freshness rank of collectors without public listings. */
    public static final int NO_LISTINGS_RANK = 2;

    private MarkerRanking() {}

    /** The comparator, given how to read the rating of a row. */
    public static Comparator<MarkerRow> comparator(Function<MarkerRow, RatingSummary> ratings) {
        return Comparator.<MarkerRow>comparingInt(MarkerRanking::freshnessKey)
                .thenComparingInt(row -> bucketRank(row.distanceMetres()))
                .thenComparing(
                        row -> ratings.apply(row).average(),
                        Comparator.nullsLast(Comparator.<Double>reverseOrder()))
                .thenComparing(
                        row -> ratings.apply(row).count(), Comparator.<Integer>reverseOrder())
                .thenComparing(
                        MarkerRow::distanceMetres,
                        Comparator.nullsLast(Comparator.<Double>naturalOrder()))
                .thenComparing(MarkerRow::handle);
    }

    static int freshnessKey(MarkerRow row) {
        Integer rank = row.freshnessRank();
        return rank == null ? NO_LISTINGS_RANK : rank;
    }

    /** Index of the distance bucket; after every bucket when there is no distance. */
    public static int bucketRank(@Nullable Double distanceMetres) {
        if (distanceMetres == null) {
            return DistanceBucket.values().length;
        }
        return DistanceBucket.ofKm(distanceMetres / 1000.0).ordinal();
    }
}
