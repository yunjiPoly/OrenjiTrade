package com.orenjitrade.api.search.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.api.PublicBinderResponses.PublicBinderSummaryResponse;
import com.orenjitrade.api.binders.domain.PublicBinderService.PublicBinderHit;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.search.domain.RegionMapService;
import com.orenjitrade.api.search.domain.RegionMapService.BinderCounts;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The map's data (ADR 0017): public binders per state/province of a platform region and the binders
 * of one state/province. permitAll GETs that honour a bearer token when present (blocks). No
 * collectors, pins or coordinates: the boundaries are static web assets.
 */
@RestController
@Validated
@Tag(name = "map", description = "Public binders per state/province of a region (auth optional)")
public class RegionMapController {

    private final RegionMapService regionMapService;
    private final TimeProvider timeProvider;

    public RegionMapController(RegionMapService regionMapService, TimeProvider timeProvider) {
        this.regionMapService = regionMapService;
        this.timeProvider = timeProvider;
    }

    @GetMapping(
            path = "/api/v1/regions/{region}/binder-counts",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "getRegionBinderCounts",
            summary = "Public binders per state/province of a region (auth optional)",
            description =
                    "Effectively public binders holding at least one public item, and public deck"
                        + " cores (which need no cards), whose owner is discoverable (opted in,"
                        + " ACTIVE, profile not PRIVATE, listings not paused) with a location in"
                        + " the region, per subdivision code; `deckCoreCount` says how many of them"
                        + " are deck cores (other binders = binderCount - deckCoreCount)."
                        + " Subdivisions without binders are absent. Signed-in callers never count"
                        + " collectors blocked with them. Anonymous answers are cached server-side"
                        + " 60 s.")
    @ApiResponse(responseCode = "200", description = "Binder counts per subdivision")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown region",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = SearchController.PROBLEM_REF)))
    public RegionBinderCountsResponse binderCounts(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable @Size(max = 32) String region) {
        return RegionBinderCountsResponse.from(
                regionMapService.binderCounts(SearchController.viewer(principal), region));
    }

    @GetMapping(
            path = "/api/v1/regions/{region}/subdivisions/{code}/binders",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listSubdivisionBinders",
            summary = "Public binders of a state/province (auth optional)",
            description =
                    "Public binders (and public deck cores, which need no cards) of discoverable"
                        + " collectors located in the subdivision, most recently updated first,"
                        + " cursor paginated. Each binder carries its name, public item count,"
                        + " freshness (last update), owner block (handle, display name, avatar,"
                        + " state/province + country; never a city) and, for a deck core, its"
                        + " price, photos and key cards. `deckCore` keeps the deck cores (true) or"
                        + " the other binders (false); `q` matches a binder's name or description,"
                        + " its owner's handle and a deck core's card names. 404 when the region is"
                        + " unknown or the subdivision is not one of its own.")
    @ApiResponse(responseCode = "200", description = "One page of binders")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown region or subdivision",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = SearchController.PROBLEM_REF)))
    public CursorPage<PublicBinderSummaryResponse> subdivisionBinders(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable @Size(max = 32) String region,
            @PathVariable @Size(max = 6) String code,
            @Parameter(description = "Deck cores only (true) or other binders only (false)")
                    @RequestParam(required = false)
                    @Nullable Boolean deckCore,
            @Parameter(
                            description =
                                    "Binder name or description, owner handle, or a card of a deck"
                                            + " core")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String q,
            @Parameter(description = "Opaque cursor of the previous page")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(RegionMapService.MAX_PAGE_SIZE)
                    int limit) {
        return page(
                regionMapService.subdivisionBinders(
                        SearchController.viewer(principal),
                        region,
                        code,
                        deckCore,
                        q,
                        cursor,
                        limit));
    }

    @GetMapping(
            path = "/api/v1/regions/{region}/binders",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listRegionBinders",
            summary = "Public binders of a whole region (auth optional)",
            description =
                    "As GET /regions/{region}/subdivisions/{code}/binders for every state and"
                            + " province of the region (Search › Binders without a state): public"
                            + " binders and deck cores of discoverable collectors, most recently"
                            + " updated first, cursor paginated, with the same `deckCore` and `q`"
                            + " filters. 404 for an unknown region.")
    @ApiResponse(responseCode = "200", description = "One page of binders")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown region",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = SearchController.PROBLEM_REF)))
    public CursorPage<PublicBinderSummaryResponse> regionBinders(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @PathVariable @Size(max = 32) String region,
            @Parameter(description = "Deck cores only (true) or other binders only (false)")
                    @RequestParam(required = false)
                    @Nullable Boolean deckCore,
            @Parameter(
                            description =
                                    "Binder name or description, owner handle, or a card of a deck"
                                            + " core")
                    @RequestParam(required = false)
                    @Size(max = 100)
                    @Nullable String q,
            @Parameter(description = "Opaque cursor of the previous page")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(RegionMapService.MAX_PAGE_SIZE)
                    int limit) {
        return page(
                regionMapService.regionBinders(
                        SearchController.viewer(principal), region, deckCore, q, cursor, limit));
    }

    private CursorPage<PublicBinderSummaryResponse> page(CursorPage<PublicBinderHit> page) {
        Instant now = timeProvider.now();
        return new CursorPage<>(
                page.items().stream()
                        .map(hit -> PublicBinderSummaryResponse.from(hit, now))
                        .toList(),
                page.nextCursor(),
                page.hasMore());
    }

    /** {@code GET /regions/{region}/binder-counts}. */
    @Schema(name = "RegionBinderCounts", description = "Public binders per state/province")
    public record RegionBinderCountsResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "americas-north") String region,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Public binders in all (deck cores included)")
                    long total,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Subdivisions holding at least one public binder")
                    List<SubdivisionBinderCount> subdivisions,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            example = "1",
                            description =
                                    "The public deck cores among `total` (stage R3). Always sent")
                    long deckCoreTotal) {

        static RegionBinderCountsResponse from(BinderCounts counts) {
            return new RegionBinderCountsResponse(
                    counts.region(),
                    counts.total(),
                    counts.subdivisions().stream()
                            .map(
                                    count ->
                                            new SubdivisionBinderCount(
                                                    count.code(),
                                                    count.binderCount(),
                                                    count.deckCoreCount()))
                            .toList(),
                    counts.deckCoreTotal());
        }
    }

    /** Public binders of one subdivision. */
    @Schema(name = "SubdivisionBinderCount")
    public record SubdivisionBinderCount(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CA-QC") String code,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "3",
                            description = "Public binders, deck cores included")
                    long binderCount,
            @Schema(
                            requiredMode = RequiredMode.NOT_REQUIRED,
                            example = "1",
                            description =
                                    "The public deck cores among them (stage R3): the map's state"
                                            + " card says \"{n} binders · {n} deck cores\" with"
                                            + " binderCount - deckCoreCount binders. Always sent")
                    long deckCoreCount) {}
}
