package com.orenjitrade.api.location.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.location.api.RegionResponses.CountryResponse;
import com.orenjitrade.api.location.api.RegionResponses.RegionsResponse;
import com.orenjitrade.api.location.domain.RegionCatalog;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/regions} (ADMIN, SUPER_ADMIN; audited): the region lists with inactive
 * countries, and the country-to-region mapping. Regions and subdivisions themselves are fixed
 * reference data (the subdivisions must match the boundary assets of the web map, generated with
 * them by {@code scripts/regions/build.mjs}), so they change through a migration, not here.
 */
@RestController
@RequestMapping(path = "/api/v1/admin/regions", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "admin-regions", description = "Platform region administration (admin console)")
public class AdminRegionController {

    private final RegionCatalog regions;

    public AdminRegionController(RegionCatalog regions) {
        this.regions = regions;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminRegions",
            summary = "Regions with every country, inactive ones included (ADMIN, SUPER_ADMIN)")
    public RegionsResponse list() {
        return RegionsResponse.from(regions.regions(), true);
    }

    @PutMapping(path = "/countries/{code}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminRegionCountry",
            summary = "Move a country to another region or (de)activate it (ADMIN, SUPER_ADMIN)",
            description =
                    "Inactive countries cannot be chosen any more (existing locations keep them). A"
                        + " moved country is listed and searched in its new region at once; the map"
                        + " draws it only in the boundary asset of the region it was seeded in"
                        + " until the assets are regenerated. Audited (`region.country.update`).")
    public CountryResponse updateCountry(
            @AuthenticationPrincipal AuthenticatedUser actor,
            @PathVariable String code,
            @Valid @RequestBody CountryRegionRequest body) {
        return CountryResponse.from(
                regions.updateCountry(actor, code, body.regionCode(), body.active()));
    }

    /** Body of {@code PUT /api/v1/admin/regions/countries/{code}}. */
    @Schema(name = "CountryRegionRequest")
    public record CountryRegionRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north")
                    @NotBlank
                    @Size(max = 32)
                    String regionCode,
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull Boolean active) {}
}
