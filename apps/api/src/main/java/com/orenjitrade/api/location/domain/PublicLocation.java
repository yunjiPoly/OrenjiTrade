package com.orenjitrade.api.location.domain;

/**
 * What other modules may show about a discoverable collector's location.
 *
 * @param publicPoint derived point (3 decimals)
 * @param label region label of the public point
 * @param gridCell id of the ~1 km cell (analytics)
 */
public record PublicLocation(PublicPoint publicPoint, String label, String gridCell) {}
