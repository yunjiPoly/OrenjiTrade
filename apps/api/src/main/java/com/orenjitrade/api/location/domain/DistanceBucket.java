package com.orenjitrade.api.location.domain;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Bucketed distance between collectors (ADR 0004): clients never receive raw metres. Computed from
 * public points (or from the requester's own trading-area centre to a public point), never from
 * another collector's private centre.
 */
@Schema(name = "DistanceBucket", description = "Approximate distance class")
public enum DistanceBucket {
    LT_1KM(1),
    KM_1_5(5),
    KM_5_10(10),
    KM_10_25(25),
    KM_25_50(50),
    GT_50KM(Double.POSITIVE_INFINITY);

    private final double upperKm;

    DistanceBucket(double upperKm) {
        this.upperKm = upperKm;
    }

    /** The bucket of a distance in kilometres (upper bounds exclusive). */
    public static DistanceBucket ofKm(double km) {
        for (DistanceBucket bucket : values()) {
            if (km < bucket.upperKm) {
                return bucket;
            }
        }
        return GT_50KM;
    }
}
