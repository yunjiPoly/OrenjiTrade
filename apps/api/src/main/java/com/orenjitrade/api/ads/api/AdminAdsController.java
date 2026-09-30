package com.orenjitrade.api.ads.api;

import com.orenjitrade.api.ads.api.AdRequests.AdvertiserRequest;
import com.orenjitrade.api.ads.api.AdRequests.CampaignRequest;
import com.orenjitrade.api.ads.api.AdRequests.CreativeRequest;
import com.orenjitrade.api.ads.api.AdRequests.PlacementRequest;
import com.orenjitrade.api.ads.api.AdRequests.TargetingRequest;
import com.orenjitrade.api.ads.api.AdResponses.AdvertiserResponse;
import com.orenjitrade.api.ads.api.AdResponses.CampaignDetailResponse;
import com.orenjitrade.api.ads.api.AdResponses.CampaignResponse;
import com.orenjitrade.api.ads.api.AdResponses.CreativeResponse;
import com.orenjitrade.api.ads.api.AdResponses.PlacementResponse;
import com.orenjitrade.api.ads.api.AdResponses.StatsResponse;
import com.orenjitrade.api.ads.domain.AdAdminService;
import com.orenjitrade.api.ads.domain.AdEnums.AdvertiserStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CampaignStatus;
import com.orenjitrade.api.ads.domain.AdEnums.CreativeStatus;
import com.orenjitrade.api.ads.domain.AdEnums.PlacementKey;
import com.orenjitrade.api.ads.domain.AdRows.CampaignRow;
import com.orenjitrade.api.ads.domain.Targeting.Rule;
import com.orenjitrade.api.ads.infra.AdRepository.CampaignValues;
import com.orenjitrade.api.ads.infra.AdRepository.CreativeValues;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/admin/ads/**} (ADMIN, SUPER_ADMIN; Phase 10 contract "Admin CRUD under
 * /admin/ads/** with reporting"): advertisers, placements, campaigns, creatives, targeting and
 * statistics. Every write is audited. Not feature-flagged (campaigns can be prepared while ads are
 * off).
 */
@RestController
@RequestMapping(path = "/api/v1/admin/ads", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-billing", description = "Admin: subscriptions, credits, ads, donations")
public class AdminAdsController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final AdAdminService admin;

    public AdminAdsController(AdAdminService admin) {
        this.admin = admin;
    }

    // --- Advertisers ---------------------------------------------------------------------------

    @GetMapping("/advertisers")
    @Operation(operationId = "listAdminAdvertisers", summary = "Advertisers (ADMIN)")
    public List<AdvertiserResponse> advertisers() {
        return admin.advertisers().stream().map(AdvertiserResponse::from).toList();
    }

    @PostMapping(path = "/advertisers", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createAdminAdvertiser",
            summary = "Create an advertiser (ADMIN)",
            description = "Audited (ads.advertiser.create).")
    @ApiResponse(responseCode = "201", description = "The advertiser")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdvertiserResponse createAdvertiser(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody AdvertiserRequest body) {
        return AdvertiserResponse.from(
                admin.createAdvertiser(principal, body.name(), body.contactEmail(), body.status()));
    }

    @PutMapping(path = "/advertisers/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminAdvertiser",
            summary = "Change an advertiser (ADMIN)",
            description = "Audited (ads.advertiser.update); 404 for unknown advertisers.")
    @ApiResponse(responseCode = "200", description = "The advertiser")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdvertiserResponse updateAdvertiser(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody AdvertiserRequest body) {
        return AdvertiserResponse.from(
                admin.updateAdvertiser(
                        principal,
                        id,
                        body.name(),
                        body.contactEmail(),
                        body.status() == null ? AdvertiserStatus.ACTIVE : body.status()));
    }

    // --- Placements ----------------------------------------------------------------------------

    @GetMapping("/placements")
    @Operation(operationId = "listAdminAdPlacements", summary = "Ad placements (ADMIN)")
    public List<PlacementResponse> placements() {
        return admin.placements().stream().map(PlacementResponse::from).toList();
    }

    @PutMapping(path = "/placements/{key}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminAdPlacement",
            summary = "Change a placement (ADMIN)",
            description = "Name, active, maximum ads per request (1-5). Audited.")
    public PlacementResponse updatePlacement(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable PlacementKey key,
            @Valid @RequestBody PlacementRequest body) {
        return PlacementResponse.from(
                admin.updatePlacement(principal, key, body.name(), body.active(), body.maxAds()));
    }

    // --- Campaigns -----------------------------------------------------------------------------

    @GetMapping("/campaigns")
    @Operation(
            operationId = "listAdminAdCampaigns",
            summary = "Ad campaigns (ADMIN)",
            description = "Most recent change first; status and advertiser filters.")
    public PageResponse<CampaignResponse> campaigns(
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable CampaignStatus status,
            @Parameter(description = "Advertiser filter") @RequestParam(required = false)
                    @Nullable UUID advertiserId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<CampaignRow> rows = admin.campaigns(status, advertiserId, page, size);
        return new PageResponse<>(
                rows.items().stream().map(CampaignResponse::from).toList(),
                rows.page(),
                rows.size(),
                rows.totalItems(),
                rows.totalPages());
    }

    @PostMapping(path = "/campaigns", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createAdminAdCampaign",
            summary = "Create a campaign (ADMIN)",
            description =
                    "Budgets in the campaign currency (numeric 12,2); bidAmount is the CPM or CPC"
                            + " price (ignored for FLAT); budgetDaily null spreads the remaining"
                            + " budget evenly until endAt. Audited (ads.campaign.create).")
    @ApiResponse(responseCode = "201", description = "The campaign")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CampaignDetailResponse createCampaign(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CampaignRequest body) {
        return CampaignDetailResponse.from(admin.createCampaign(principal, values(body)));
    }

    @GetMapping("/campaigns/{id}")
    @Operation(
            operationId = "getAdminAdCampaign",
            summary = "A campaign with creatives, targeting and totals (ADMIN)")
    @ApiResponse(responseCode = "200", description = "The campaign")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CampaignDetailResponse campaign(@PathVariable UUID id) {
        return CampaignDetailResponse.from(admin.campaign(id));
    }

    @PutMapping(path = "/campaigns/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminAdCampaign",
            summary = "Change a campaign (ADMIN)",
            description = "Also pauses, resumes and ends it (status). Audited.")
    @ApiResponse(responseCode = "200", description = "The campaign")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CampaignDetailResponse updateCampaign(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody CampaignRequest body) {
        return CampaignDetailResponse.from(admin.updateCampaign(principal, id, values(body)));
    }

    @PutMapping(path = "/campaigns/{id}/targeting", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "replaceAdminAdTargeting",
            summary = "Replace a campaign's targeting rules (ADMIN)",
            description =
                    "Kinds GAME, REGION_LABEL, GEO_CELL, TAG and PLAN only (never coordinates):"
                            + " kinds combine with AND, values of one kind with OR; an empty list"
                            + " targets everybody. Audited (ads.targeting.update).")
    @ApiResponse(responseCode = "200", description = "The campaign")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CampaignDetailResponse replaceTargeting(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody TargetingRequest body) {
        List<Rule> rules =
                body.rules().stream().map(rule -> new Rule(rule.kind(), rule.value())).toList();
        return CampaignDetailResponse.from(admin.replaceTargeting(principal, id, rules));
    }

    @GetMapping("/campaigns/{id}/stats")
    @Operation(
            operationId = "getAdminAdCampaignStats",
            summary = "Delivery statistics of a campaign (ADMIN)",
            description =
                    "All-time totals and one row per UTC day between from and to (default: the"
                            + " last 30 days); spend derived from the pricing model.")
    @ApiResponse(responseCode = "200", description = "The statistics")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public StatsResponse stats(
            @PathVariable UUID id,
            @Parameter(description = "First day (UTC)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    @Nullable LocalDate from,
            @Parameter(description = "Last day (UTC)")
                    @RequestParam(required = false)
                    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    @Nullable LocalDate to) {
        return StatsResponse.from(admin.stats(id, from, to));
    }

    // --- Creatives -----------------------------------------------------------------------------

    @PostMapping(path = "/campaigns/{id}/creatives", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "createAdminAdCreative",
            summary = "Add a creative to a campaign (ADMIN)",
            description =
                    "Landing and image URLs are https or a site path. Audited"
                            + " (ads.creative.create).")
    @ApiResponse(responseCode = "201", description = "The creative")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CreativeResponse createCreative(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody CreativeRequest body) {
        return CreativeResponse.from(admin.createCreative(principal, id, values(body)));
    }

    @PutMapping(path = "/creatives/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateAdminAdCreative",
            summary = "Change a creative (ADMIN)",
            description = "Audited (ads.creative.update); 404 for unknown creatives.")
    @ApiResponse(responseCode = "200", description = "The creative")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CreativeResponse updateCreative(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody CreativeRequest body) {
        return CreativeResponse.from(admin.updateCreative(principal, id, values(body)));
    }

    private static CampaignValues values(CampaignRequest body) {
        return new CampaignValues(
                body.advertiserId(),
                body.name(),
                body.status() == null ? CampaignStatus.DRAFT : body.status(),
                body.startAt(),
                body.endAt(),
                body.budgetTotal(),
                body.budgetDaily(),
                body.currency(),
                body.pricing(),
                body.bidAmount() == null ? BigDecimal.ZERO : body.bidAmount(),
                body.priority() == null ? 0 : body.priority(),
                body.frequencyCapPerDay());
    }

    private static CreativeValues values(CreativeRequest body) {
        return new CreativeValues(
                body.placement(),
                body.headline(),
                body.body() == null ? "" : body.body(),
                body.imageUrl(),
                body.ctaLabel(),
                body.landingUrl(),
                body.status() == null ? CreativeStatus.DRAFT : body.status());
    }
}
