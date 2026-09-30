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
 * when present. PostgreSQL full text and trigrams (ADR 0012); geography through public points and
 * distance buckets only (ADR 0004).
 */
@RestController
@Validated
@Tag(
        name = "search",
        description =
                "Unified search over cards, printings, sets, collectors and public binders, card"
                        + " holders near you and mixed autocomplete (auth optional)")
public class SearchController {

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
                        + " is set and `collectors` lists the holders of it with `matchingItems`"
                        + " (nearby when a centre is known: `lat`/`lng` or the signed-in caller's"
                        + " trading area); otherwise collectors matching the text. Binders carry"
                        + " their owner block. `radiusKm` beyond the plan cap → 429 LIMIT_REACHED."
                        + " Emits the analytics events search_performed / search_no_results.")
    @ApiResponse(responseCode = "200", description = "Results per section")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid query, type, game or centre",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = DiscoveryController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (`map.radius.max_km`) or RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = DiscoveryController.PROBLEM_REF)))
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
            @RequestParam(required = false) @Nullable Double lat,
            @RequestParam(required = false) @Nullable Double lng,
            @RequestParam(required = false) @Nullable Double radiusKm,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) int limit) {
        return UnifiedSearchResponse.from(
                searchService.search(
                        DiscoveryController.viewer(principal),
                        new UnifiedQuery(
                                q,
                                SearchService.parseTypes(types == null ? List.of() : types),
                                game,
                                lat,
                                lng,
                                radiusKm,
                                limit)),
                timeProvider.now());
    }

    @GetMapping(path = "/api/v1/search/card-holders", produces = MediaType.APPLICATION_JSON_VALUE)
    @SecurityRequirements
    @Operation(
            operationId = "searchCardHolders",
            summary = "Collectors near you holding a card (auth optional)",
            description =
                    "Public, fresh (ACTIVE or AGING) items of `printingId` or of any printing of"
                        + " `cardId` (exactly one) held by collectors on the map within `radiusKm`"
                        + " of the centre (`lat`/`lng`, else the signed-in caller's trading area;"
                        + " required when signed out). The caller's own items are excluded."
                        + " Filters: `availability`, `condition`, `minPrice`/`maxPrice` (items"
                        + " without a price never match), `freshness`, `edition`, `language`,"
                        + " `acceptsOffers`. `sort`: distance (default), price, freshness. Each row"
                        + " pairs the holder's marker with the public item.")
    @ApiResponse(responseCode = "200", description = "One page of holders")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid filter, sort or centre",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = DiscoveryController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (`map.radius.max_km`) or RATE_LIMITED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = DiscoveryController.PROBLEM_REF)))
    public PageResponse<CardHolderResultResponse> cardHolders(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @RequestParam(required = false) @Nullable UUID printingId,
            @RequestParam(required = false) @Nullable UUID cardId,
            @RequestParam(required = false) @Nullable Double lat,
            @RequestParam(required = false) @Nullable Double lng,
            @RequestParam(required = false) @Nullable Double radiusKm,
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
                            description = "distance, price or freshness",
                            schema =
                                    @Schema(
                                            allowableValues = {"distance", "price", "freshness"},
                                            defaultValue = "distance"))
                    @RequestParam(defaultValue = "distance")
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
                                                                "must be distance, price or"
                                                                        + " freshness"))));
        PageResponse<CardHolder> holders =
                searchService.cardHolders(
                        DiscoveryController.viewer(principal),
                        new HolderQuery(
                                printingId,
                                cardId,
                                lat,
                                lng,
                                radiusKm,
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
                    "Printing codes and cards, collectors on the map who allow name search (closest"
                        + " first when `lat`/`lng` or the caller's trading area is known), sets,"
                        + " public binders and tags, interleaved one per kind until `limit`."
                        + " COLLECTOR entries carry the handle in `slug`, TAG entries the tag slug,"
                        + " PRINTING entries their `cardId`.")
    @ApiResponse(responseCode = "200", description = "Suggestions")
    @ApiResponse(
            responseCode = "400",
            description = "Invalid query or centre",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = DiscoveryController.PROBLEM_REF)))
    public List<SuggestionResponse> suggest(
            @AuthenticationPrincipal @Nullable AuthenticatedUser principal,
            @Parameter(description = "Typed text") @RequestParam @NotBlank @Size(max = 100)
                    String q,
            @Parameter(description = "Game slug") @RequestParam(required = false) @Size(max = 32)
                    @Nullable String game,
            @RequestParam(required = false) @Nullable Double lat,
            @RequestParam(required = false) @Nullable Double lng,
            @RequestParam(defaultValue = "10") @Min(1) @Max(30) int limit) {
        return searchService
                .suggest(DiscoveryController.viewer(principal), q, game, lat, lng, limit)
                .stream()
                .map(SuggestionResponse::from)
                .toList();
    }
}
