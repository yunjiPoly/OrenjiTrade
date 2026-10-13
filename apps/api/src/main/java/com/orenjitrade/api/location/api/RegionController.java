package com.orenjitrade.api.location.api;

import com.orenjitrade.api.location.api.RegionResponses.RegionsResponse;
import com.orenjitrade.api.location.domain.RegionCatalog;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/v1/regions}: platform regions, countries and subdivisions (public). */
@RestController
@Tag(name = "regions", description = "Platform regions, their countries and subdivisions")
public class RegionController {

    private final RegionCatalog regions;

    public RegionController(RegionCatalog regions) {
        this.regions = regions;
    }

    @GetMapping(path = "/api/v1/regions", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listRegions",
            summary = "Platform regions with their countries and subdivisions (public)",
            description =
                    "The three platform regions (ADR 0017) in display order, each with its active"
                        + " countries (ISO 3166-1 alpha-2) and their first-level subdivisions (ISO"
                        + " 3166-2; a country without usable subdivisions has one"
                        + " pseudo-subdivision coded with its alpha-2 code, `wholeCountry` true)."
                        + " The codes match the web map's boundary assets. Data, not code: admins"
                        + " move countries between regions through /admin/regions. Cached"
                        + " server-side 60 s.")
    public RegionsResponse list() {
        return RegionsResponse.from(regions.regions(), false);
    }
}
