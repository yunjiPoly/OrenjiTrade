package com.orenjitrade.api.ads.api;

import com.orenjitrade.api.ads.api.AdRequests.ImpressionRequest;
import com.orenjitrade.api.ads.api.AdResponses.AdResponse;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdService;
import com.orenjitrade.api.ads.infra.AdProperties;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/ads} (Phase 10 contract "Advertising framework"; feature flag {@code
 * advertising}). Public routes (a bearer token personalises targeting and hides ads for PREMIUM):
 * {@code GET /ads} answers {@code []} while ads are off for the caller; impressions and clicks are
 * recorded once per signed serve token. Every ad is labelled "Sponsored".
 */
@RestController
@Validated
@Tag(name = "ads", description = "Sponsored placements (internal campaigns)")
public class AdController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final AdService ads;
    private final AdProperties properties;

    public AdController(AdService ads, AdProperties properties) {
        this.ads = ads;
        this.properties = properties;
    }

    @GetMapping(path = "/api/v1/ads", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "listAds",
            summary = "Sponsored ads for a placement (public)",
            description =
                    "Targeting uses the requested game and platform region and, for signed-in"
                        + " callers, their country and state/province, interest games, tags and"
                        + " plan (never a city or a coordinate). [] while the advertising flag is"
                        + " off for the caller or ads.enabled is false (PREMIUM, entitlements)."
                        + " Each ad carries an impressionToken for POST"
                        + " /ads/{creativeId}/impression and a clickUrl; UIs always show the"
                        + " Sponsored label.")
    @ApiResponse(responseCode = "200", description = "The ads (possibly empty)")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (placement, game or region)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<List<AdResponse>> list(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @Parameter(description = "Placement", required = true) @RequestParam
                    PlacementKey placement,
            @Parameter(description = "Game slug of the page", example = "pokemon")
                    @RequestParam(required = false)
                    @Size(max = 60)
                    @Nullable String game,
            @Parameter(
                            description = "Platform region of the page (GET /regions)",
                            example = "americas-north")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String region) {
        List<AdResponse> body =
                ads
                        .ads(principal == null ? null : principal.userId(), placement, game, region)
                        .stream()
                        .map(AdResponse::from)
                        .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @PostMapping(
            path = "/api/v1/ads/{creativeId}/impression",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @SecurityRequirements
    @Operation(
            operationId = "recordAdImpression",
            summary = "Record that a served ad was shown (public)",
            description =
                    "Idempotent per impressionToken (one impression per serve); 400 for a token"
                            + " not issued for this ad or older than 24 hours.")
    @ApiResponse(responseCode = "204", description = "Recorded (or already recorded)")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (token)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void impression(
            @PathVariable UUID creativeId, @Valid @RequestBody ImpressionRequest body) {
        ads.recordImpression(creativeId, body.token());
    }

    @GetMapping(path = "/api/v1/ads/{creativeId}/click")
    @SecurityRequirements
    @Operation(
            operationId = "clickAd",
            summary = "Open a sponsored ad's landing page (public)",
            description =
                    "302 to the landing page; a valid token records the click once per serve"
                            + " (relative landing paths are sent to the web app). 404 for unknown"
                            + " ads.")
    @ApiResponse(responseCode = "302", description = "Redirect to the landing page")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<Void> click(
            @PathVariable UUID creativeId,
            @Parameter(description = "Serve token from the clickUrl")
                    @RequestParam(required = false)
                    @Size(max = 1000)
                    @Nullable String token) {
        String landing = ads.click(creativeId, token);
        String location = landing.startsWith("/") ? properties.webBaseUrl() + landing : landing;
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, URI.create(location).toString())
                .cacheControl(CacheControl.noStore())
                .build();
    }
}
