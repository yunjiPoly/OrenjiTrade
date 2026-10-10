package com.orenjitrade.api.location.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.location.domain.MyLocationView;
import com.orenjitrade.api.location.domain.PublicPlace;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import org.jspecify.annotations.Nullable;

/**
 * Response of {@code GET|PUT /api/v1/me/location}: the caller's own location settings, the only
 * response besides the caller's export and public profile that contains their city.
 */
@Schema(name = "MyLocationResponse", description = "The caller's own location settings")
public record MyLocationResponse(
        @Schema(nullable = true, description = "Null while no location is set")
                @JsonInclude(JsonInclude.Include.ALWAYS)
                @Nullable MyLocation location,
        @Schema(requiredMode = RequiredMode.REQUIRED) boolean discoverable) {

    static MyLocationResponse from(MyLocationView view) {
        @Nullable PublicPlace place = view.place();
        return new MyLocationResponse(
                place == null
                        ? null
                        : new MyLocation(
                                place.regionCode(),
                                view.regionName() == null ? place.regionCode() : view.regionName(),
                                place.countryCode(),
                                place.countryName(),
                                place.subdivisionCode(),
                                place.subdivisionName(),
                                place.label(),
                                view.city(),
                                view.showCity()),
                view.discoverable());
    }

    /** The owner's location (owner only). */
    @Schema(name = "MyLocation", description = "Country, state/province and optional city")
    public record MyLocation(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north")
                    String regionCode,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Americas (North)")
                    String regionName,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CA") String countryCode,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Canada") String countryName,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CA-QC") String subdivisionCode,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Quebec")
                    String subdivisionName,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Quebec, Canada") String label,
            @Schema(nullable = true, example = "Montréal") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String city,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Show the city on the public profile")
                    boolean showCity) {}
}
