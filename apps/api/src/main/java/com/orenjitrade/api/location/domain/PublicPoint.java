package com.orenjitrade.api.location.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/**
 * A server-derived, deliberately imprecise public position (ADR 0004): grid-snapped, jittered and
 * rounded to 3 decimals. The only kind of coordinate the API ever returns about another collector.
 */
@Schema(
        name = "PublicPoint",
        description =
                "Approximate public position (about 1 km grid + deterministic jitter, 3 decimals);"
                        + " never the collector's real location")
public record PublicPoint(
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "45.522") double lat,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "-73.581") double lng) {

    public PublicPoint {
        lat = GeoMath.round3(lat);
        lng = GeoMath.round3(lng);
    }
}
