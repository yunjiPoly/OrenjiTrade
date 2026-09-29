package com.orenjitrade.api.location.domain;

/**
 * Output of {@link ApproximateLocationService#derive}: what may be published about a trading area.
 *
 * @param publicPoint grid-snapped, jittered point (3 decimals)
 * @param label region label of the public point
 * @param cell grid cell containing both the trading-area centre and the public point
 */
public record DerivedLocation(PublicPoint publicPoint, String label, GridCell cell) {}
