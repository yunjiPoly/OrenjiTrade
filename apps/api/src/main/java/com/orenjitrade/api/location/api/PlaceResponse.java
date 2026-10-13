package com.orenjitrade.api.location.api;

import com.orenjitrade.api.location.domain.PublicPlace;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/**
 * A collector's public place (ADR 0017): state/province and country, never a city, a coordinate or
 * a distance. Used by every response that shows where another collector is (search, card holders,
 * binders, offers); only the collector profile adds the city ({@code ProfileLocation}).
 */
@Schema(
        name = "Place",
        description = "State/province and country of a collector; never a city or a coordinate")
public record PlaceResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north") String regionCode,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "CA") String countryCode,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Canada") String countryName,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "CA-QC",
                        description =
                                "ISO 3166-2 code, or the country's alpha-2 code for a"
                                        + " whole-country pseudo-subdivision")
                String subdivisionCode,
        @Schema(requiredMode = RequiredMode.REQUIRED, example = "Quebec") String subdivisionName,
        @Schema(
                        requiredMode = RequiredMode.REQUIRED,
                        example = "Quebec, Canada",
                        description = "State/province + country, or the country alone")
                String label) {

    public static PlaceResponse from(PublicPlace place) {
        return new PlaceResponse(
                place.regionCode(),
                place.countryCode(),
                place.countryName(),
                place.subdivisionCode(),
                place.subdivisionName(),
                place.label());
    }
}
