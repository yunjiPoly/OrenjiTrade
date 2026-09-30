package com.orenjitrade.api.search.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.search.api.SearchResponses.CollectorPreviewResponse;
import com.orenjitrade.api.search.api.SearchResponses.NearbyCollectorsResponse;
import com.orenjitrade.api.search.domain.CollectorDiscoveryService;
import com.orenjitrade.api.search.domain.CollectorDiscoveryService.NearbyRequest;
import com.orenjitrade.api.search.domain.SearchAvailability;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Map discovery (Phase 4 contract "Collectors nearby"): permitAll GETs that honour a bearer token
 * when present (distance buckets, the caller's own trading area as default centre, messaging
 * state). Responses carry derived public points and distance buckets only (ADR 0004).
 */
@RestController
@Validated
@Tag(
        name = "discovery",
        description =
                "Map discovery: collectors near a centre and their preview cards (auth optional)")
public class DiscoveryController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final CollectorDiscoveryService discoveryService;

    public DiscoveryController(CollectorDiscoveryService discoveryService) {
        this.discoveryService = discoveryService;
    }

    @GetMapping(path = "/api/v1/collectors/nearby", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listNearbyCollectors",
            summary = "Collectors on the map around a centre (auth optional)",
            description =
                    "Discoverable collectors (ACTIVE account, profile not PRIVATE) whose derived"
                        + " public point is within `radiusKm` of the centre (`ST_DWithin` on the"
                        + " public point). The centre is `lat`/`lng` snapped to 0.01° or, when"
                        + " omitted, the signed-in caller's own trading area; signed-out callers"
                        + " must pass it. `radiusKm` defaults to 10 (lowered to the plan cap);"
                        + " beyond the caller's `map.radius.max_km` (FREE 25, PREMIUM 100;"
                        + " signed-out: FREE) → 429 LIMIT_REACHED. Filters: `game` (plays it or"
                        + " lists it), `availability` (TRADE, SALE, TRADE_OR_SALE, ACCEPTS_OFFERS),"
                        + " `freshness` (ACTIVE or AGING), `tags` (any), `hasPrintingId` /"
                        + " `hasCardId` (lists it publicly), `query` (handle, display name or tag"
                        + " text of collectors who allow name search). Collectors whose public"
                        + " listings are all stale never appear; STALE and HIDDEN items never"
                        + " match. Ranking: freshness (ACTIVE > AGING > no listings), distance,"
                        + " rating. Signed-out callers get no distance buckets. Cached 60 s per"
                        + " rounded centre, radius and filters.")
    @ApiResponse(responseCode = "200", description = "Markers around the centre")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid filter, partial centre, or no centre for a signed-out caller",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (`map.radius.max_km`) or RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public NearbyCollectorsResponse nearby(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @Parameter(description = "Centre latitude (required when signed out)")
                    @RequestParam(required = false)
                    @Nullable Double lat,
            @Parameter(description = "Centre longitude (required when signed out)")
                    @RequestParam(required = false)
                    @Nullable Double lng,
            @Parameter(description = "Radius in km (default 10, capped by the plan)")
                    @RequestParam(required = false)
                    @Nullable Double radiusKm,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @RequestParam(required = false) @Nullable SearchAvailability availability,
            @Parameter(description = "ACTIVE or AGING") @RequestParam(required = false)
                    @Nullable FreshnessState freshness,
            @Parameter(description = "Tag slugs (any), repeated or comma separated")
                    @RequestParam(required = false)
                    @Nullable List<String> tags,
            @Parameter(description = "Collectors listing this printing publicly")
                    @RequestParam(required = false)
                    @Nullable UUID hasPrintingId,
            @Parameter(description = "Collectors listing a printing of this card publicly")
                    @RequestParam(required = false)
                    @Nullable UUID hasCardId,
            @Parameter(description = "Handle, display name or tag text")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String query,
            @RequestParam(defaultValue = "200") @Min(1) @Max(500) int limit) {
        return NearbyCollectorsResponse.from(
                discoveryService.nearby(
                        viewer(principal),
                        new NearbyRequest(
                                lat,
                                lng,
                                radiusKm,
                                game,
                                availability,
                                freshness,
                                tags == null ? List.of() : tags,
                                hasPrintingId,
                                hasCardId,
                                query,
                                limit)));
    }

    @GetMapping(
            path = "/api/v1/collectors/{handle}/preview",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "getCollectorPreview",
            summary = "Map preview card of a collector (auth optional)",
            description =
                    "The marker payload of one collector on the map plus `canMessage` and"
                        + " `isBlocked`. 404 unless the collector is on the map (unknown,"
                        + " suspended, pending deletion, not discoverable or PRIVATE profile)."
                        + " `distanceBucket` is measured from `lat`/`lng` when given, else from the"
                        + " signed-in caller's trading area; null for signed-out callers.")
    @ApiResponse(responseCode = "200", description = "Preview card")
    @ApiResponse(
            responseCode = "404",
            description = "Collector not on the map",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CollectorPreviewResponse preview(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable String handle,
            @Parameter(description = "Centre latitude for the distance bucket")
                    @RequestParam(required = false)
                    @Nullable Double lat,
            @Parameter(description = "Centre longitude for the distance bucket")
                    @RequestParam(required = false)
                    @Nullable Double lng) {
        return CollectorPreviewResponse.from(
                discoveryService.preview(viewer(principal), handle, lat, lng));
    }

    static @Nullable UUID viewer(@Nullable AuthenticatedUser principal) {
        return principal == null ? null : principal.userId();
    }
}
