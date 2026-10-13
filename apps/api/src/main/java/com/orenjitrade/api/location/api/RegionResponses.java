package com.orenjitrade.api.location.api;

import com.orenjitrade.api.location.domain.CountryView;
import com.orenjitrade.api.location.domain.RegionView;
import com.orenjitrade.api.location.domain.SubdivisionView;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.util.List;

/** Responses of {@code GET /api/v1/regions} and the region administration (ADR 0017). */
public final class RegionResponses {

    private RegionResponses() {}

    /** Every platform region with its active countries and their subdivisions. */
    @Schema(name = "RegionsResponse")
    public record RegionsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) List<RegionResponse> regions) {

        static RegionsResponse from(List<RegionView> regions, boolean includeInactive) {
            return new RegionsResponse(
                    regions.stream()
                            .map(region -> RegionResponse.from(region, includeInactive))
                            .toList());
        }
    }

    /** A platform region. */
    @Schema(name = "PlatformRegion")
    public record RegionResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north") String code,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Americas (North)") String name,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The default region of signed-out visitors")
                    boolean isDefault,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<CountryResponse> countries) {

        static RegionResponse from(RegionView region, boolean includeInactive) {
            return new RegionResponse(
                    region.code(),
                    region.name(),
                    region.isDefault(),
                    region.countries().stream()
                            .filter(country -> includeInactive || country.active())
                            .map(CountryResponse::from)
                            .toList());
        }
    }

    /** A country of a region. */
    @Schema(name = "RegionCountry")
    public record CountryResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CA") String code,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Canada") String name,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north")
                    String regionCode,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Inactive countries are listed to admins only")
                    boolean active,
            @Schema(requiredMode = RequiredMode.REQUIRED) List<SubdivisionResponse> subdivisions) {

        static CountryResponse from(CountryView country) {
            return new CountryResponse(
                    country.code(),
                    country.name(),
                    country.regionCode(),
                    country.active(),
                    country.subdivisions().stream().map(SubdivisionResponse::from).toList());
        }
    }

    /** A state, province or other first-level subdivision. */
    @Schema(name = "RegionSubdivision")
    public record SubdivisionResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CA-QC") String code,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Quebec") String name,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Stands for the whole country (its code is the alpha-2 code)")
                    boolean wholeCountry) {

        static SubdivisionResponse from(SubdivisionView subdivision) {
            return new SubdivisionResponse(
                    subdivision.code(), subdivision.name(), subdivision.wholeCountry());
        }
    }
}
