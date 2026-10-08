package com.orenjitrade.api.search.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.delisting.domain.FreshnessState;
import com.orenjitrade.api.search.api.SearchResponses.CardHolderResultResponse;
import com.orenjitrade.api.search.api.SearchResponses.SuggestionResponse;
import com.orenjitrade.api.search.api.SearchResponses.UnifiedSearchResponse;
import com.orenjitrade.api.search.domain.DiscoveryResults.CardHolder;
import com.orenjitrade.api.search.domain.HolderSort;
import com.orenjitrade.api.search.domain.SearchAvailability;
import com.orenjitrade.api.search.domain.SearchService;
import com.orenjitrade.api.search.domain.SearchService.HolderQuery;
import com.orenjitrade.api.search.domain.SearchService.UnifiedQuery;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Unified search (Phase 4 contract "Unified search"): permitAll GETs that honour a bearer token
 * when present. PostgreSQL full text and trigrams (ADR 0012); collectors, holders and binders are
 * scoped to one platform region (ADR 0017): no coordinates, no distances.
 */
@RestController
@Validated
@Tag(
        name = "search",
        description =
                "Unified search over cards, printings, sets, collectors and public binders, card"
                        + " holders in a region and mixed autocomplete (auth optional)")
public class SearchController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final SearchService searchService;
    private final TimeProvider timeProvider;

    public SearchController(SearchService searchService, TimeProvider timeProvider) {
        this.searchService = searchService;
        this.timeProvider = timeProvider;
    }

    @GetMapping(path = "/api/v1/search", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "search",
            summary = "Unified search (auth optional)",
            description =
                    "Cards (full text + trigram), printings (printing-code prefix, or the printings"
                        + " of the resolved card), sets, collectors and public binders, at most"
                        + " `limit` per section (`types` narrows the sections). When `q` designates"
                        + " a printing (an exact code carried by one printing) or a card (an exact"
                        + " code of one card, an exact card name or a single card hit), `resolved`"
                        + " is set and `collectors` lists the holders of it with `matchingItems`;"
                        + " otherwise collectors matching the text. Collectors and binders belong"
                        + " to discoverable collectors of `region` (default: the caller's home"
                        + " region, else americas-north; 400 for an unknown code). Binders carry"
                        + " their owner block. Emits the analytics events search_performed /"
                        + " search_no_results.")
    @ApiResponse(responseCode = "200", description = "Results per section")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid query, type, game or region",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public UnifiedSearchResponse search(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @Parameter(description = "Query text or printing code")
                    @RequestParam
                    @NotBlank
                    @Size(max = 100)
                    String q,
            @Parameter(
                            description =
                                    "Sections: cards, printings, sets, collectors, binders"
                                            + " (repeated or comma separated; default all)")
                    @RequestParam(required = false)
                    @Nullable List<String> types,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @Parameter(
                            description =
                                    "Platform region code (GET /regions); default: the caller's"
                                            + " home region, else americas-north. Scopes results"
                                            + " only, never grants access")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String region,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int limit) {
        return UnifiedSearchResponse.from(
                searchService.search(
                        viewer(principal),
                        new UnifiedQuery(
                                q,
                                SearchService.parseTypes(types == null ? List.of() : types),
                                game,
                                region,
                                limit)),
                timeProvider.now());
    }

    @GetMapping(path = "/api/v1/search/card-holders", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "searchCardHolders",
            summary = "Collectors of a region holding a card (auth optional)",
            description =
                    "Public, fresh (ACTIVE or AGING) items of `printingId` or of any printing of"
                        + " `cardId` (exactly one) held by discoverable collectors whose country is"
                        + " in `region` (default: the caller's home region, else americas-north)."
                        + " The caller's own items are excluded. Filters: `availability`,"
                        + " `condition`, `minPrice`/`maxPrice` (items without a price never match),"
                        + " `freshness`, `edition`, `language`, `acceptsOffers`. `sort`: freshness"
                        + " (default, newest listing first) or price. Each row pairs the holder"
                        + " (state/province + country, never a distance) with the public item.")
    @ApiResponse(responseCode = "200", description = "One page of holders")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid filter, sort or region",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PageResponse<CardHolderResultResponse> cardHolders(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @RequestParam(required = false) @Nullable UUID printingId,
            @RequestParam(required = false) @Nullable UUID cardId,
            @Parameter(
                            description =
                                    "Platform region code (GET /regions); default: the caller's"
                                            + " home region, else americas-north. Scopes results"
                                            + " only, never grants access")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String region,
            @RequestParam(required = false) @Nullable SearchAvailability availability,
            @Parameter(description = "Condition code, e.g. NEAR_MINT")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String condition,
            @RequestParam(required = false) @DecimalMin("0") @DecimalMax("9999999999.99")
                    @Nullable BigDecimal minPrice,
            @RequestParam(required = false) @DecimalMin("0") @DecimalMax("9999999999.99")
                    @Nullable BigDecimal maxPrice,
            @Parameter(description = "ACTIVE or AGING") @RequestParam(required = false)
                    @Nullable FreshnessState freshness,
            @Parameter(description = "Edition code, e.g. FIRST_EDITION")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String edition,
            @Parameter(description = "ISO 639-1 code")
                    @RequestParam(required = false)
                    @Size(max = 2)
                    @Nullable String language,
            @RequestParam(required = false) @Nullable Boolean acceptsOffers,
            @Parameter(
                            description = "freshness (newest listing first) or price",
                            schema =
                                    @Schema(
                                            allowableValues = {"freshness", "price"},
                                            defaultValue = "freshness"))
                    @RequestParam(defaultValue = "freshness")
                    String sort,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        HolderSort holderSort =
                HolderSort.parse(sort)
                        .orElseThrow(
                                () ->
                                        ApiException.validation(
                                                "Validation failed",
                                                List.of(
                                                        new ProblemFieldError(
                                                                "sort",
                                                                "must be freshness or price"))));
        PageResponse<CardHolder> holders =
                searchService.cardHolders(
                        viewer(principal),
                        new HolderQuery(
                                printingId,
                                cardId,
                                region,
                                availability,
                                condition,
                                minPrice,
                                maxPrice,
                                freshness,
                                edition,
                                language,
                                acceptsOffers,
                                holderSort,
                                page,
                                size));
        Instant now = timeProvider.now();
        return new PageResponse<>(
                holders.items().stream()
                        .map(holder -> CardHolderResultResponse.from(holder, now))
                        .toList(),
                holders.page(),
                holders.size(),
                holders.totalItems(),
                holders.totalPages());
    }

    @GetMapping(path = "/api/v1/search/suggest", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "suggestSearch",
            summary = "Mixed autocomplete (auth optional)",
            description =
                    "Printing codes and cards, discoverable collectors of `region` who allow name"
                        + " search, sets, public binders of the region and tags, interleaved one"
                        + " per kind until `limit`. COLLECTOR entries carry the handle in `slug`,"
                        + " TAG entries the tag slug, PRINTING entries their `cardId`.")
    @ApiResponse(responseCode = "200", description = "Suggestions")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid query or region",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public List<SuggestionResponse> suggest(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @Parameter(description = "Typed text") @RequestParam @NotBlank @Size(max = 100)
                    String q,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @Parameter(
                            description =
                                    "Platform region code (GET /regions); default: the caller's"
                                            + " home region, else americas-north. Scopes results"
                                            + " only, never grants access")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String region,
            @RequestParam(defaultValue = "10") @Min(1) @Max(30) int limit) {
        return searchService.suggest(viewer(principal), q, game, region, limit).stream()
                .map(SuggestionResponse::from)
                .toList();
    }

    static @Nullable UUID viewer(@Nullable AuthenticatedUser principal) {
        return principal == null ? null : principal.userId();
    }
}
