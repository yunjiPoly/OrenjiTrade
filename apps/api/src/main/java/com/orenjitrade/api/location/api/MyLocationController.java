package com.orenjitrade.api.location.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.location.domain.LocationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/me/location}: the caller's self-declared country, state/province and optional city
 * (ADR 0017). No coordinates, GPS, geocoding or distances.
 */
@RestController
@RequestMapping(path = "/api/v1/me/location", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "location", description = "Country, state/province and optional city of the caller")
public class MyLocationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final LocationService locationService;

    public MyLocationController(LocationService locationService) {
        this.locationService = locationService;
    }

    @GetMapping
    @Operation(
            operationId = "getMyLocation",
            summary = "The caller's location",
            description =
                    "Country, state/province, optional city and the show-city switch. `location` is"
                            + " null while none is set (the caller cannot be discoverable then).")
    public MyLocationResponse get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return MyLocationResponse.from(locationService.getMine(principal.userId()));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateMyLocation",
            summary = "Set the caller's location",
            description =
                    "`countryCode` must be an active country and `subdivisionCode` one of its"
                        + " subdivisions (`GET /regions`); unknown codes are 400 VALIDATION_FAILED."
                        + " `city` is optional free text (trimmed, at most 80 characters,"
                        + " moderated, never geocoded) shown only on the caller's own public"
                        + " profile while `showCity` is true (default). Everywhere else other"
                        + " collectors see the state/province and the country only.")
    @ApiResponse(responseCode = "200", description = "The saved location")
    @ApiResponse(
            responseCode = "400",
            description = "Unknown country or subdivision, or an invalid city",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MyLocationResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateLocationRequest body) {
        return MyLocationResponse.from(
                locationService.setMine(
                        principal.userId(),
                        body.countryCode(),
                        body.subdivisionCode(),
                        body.city(),
                        body.showCity()));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteMyLocation",
            summary = "Remove the caller's location",
            description =
                    "Deletes the location; discoverability is turned off with it (it needs a"
                            + " country and a state/province).")
    @ApiResponse(responseCode = "204", description = "Removed")
    public void delete(@AuthenticationPrincipal AuthenticatedUser principal) {
        locationService.deleteMine(principal.userId());
    }
}
