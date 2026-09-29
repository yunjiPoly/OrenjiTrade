package com.orenjitrade.api.location.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.location.domain.LocationService;
import com.orenjitrade.api.location.domain.TradingAreaSource;
import io.swagger.v3.oas.annotations.Operation;
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

/** {@code /api/v1/me/location}: the caller's approximate trading area (ADR 0004). */
@RestController
@RequestMapping(path = "/api/v1/me/location", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "location", description = "Approximate trading area and public map position")
public class MyLocationController {

    private final LocationService locationService;

    public MyLocationController(LocationService locationService) {
        this.locationService = locationService;
    }

    @GetMapping
    @Operation(
            operationId = "getMyLocation",
            summary = "The caller's trading area and public point",
            description =
                    "The only endpoint that returns the caller's chosen centre. `publicPoint` is"
                            + " what other collectors see and is null while not discoverable.")
    public MyLocationResponse get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return MyLocationResponse.from(locationService.getMine(principal.userId()));
    }

    @PutMapping(path = "/trading-area", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateMyTradingArea",
            summary = "Set the caller's trading area",
            description =
                    "Radius 1-50 km, latitude within +/-85. The server snaps the centre to a ~1 km"
                        + " grid cell and offsets it with a deterministic per-user jitter to derive"
                        + " `publicPoint` (3 decimals) and its region label.")
    public MyLocationResponse updateTradingArea(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody UpdateTradingAreaRequest body) {
        TradingAreaSource source = body.source() != null ? body.source() : TradingAreaSource.MANUAL;
        return MyLocationResponse.from(
                locationService.setTradingArea(
                        principal.userId(), body.lat(), body.lng(), body.radiusKm(), source));
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteMyLocation",
            summary = "Remove the caller's location",
            description = "Deletes every location row; the collector disappears from the map.")
    @ApiResponse(responseCode = "204", description = "Removed")
    public void delete(@AuthenticationPrincipal AuthenticatedUser principal) {
        locationService.deleteMine(principal.userId());
    }
}
