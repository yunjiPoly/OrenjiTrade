package com.orenjitrade.api.search.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.search.api.FeedResponses.FeedPageResponse;
import com.orenjitrade.api.search.domain.FeedRules;
import com.orenjitrade.api.search.domain.FeedService;
import com.orenjitrade.api.search.domain.FeedService.FeedQuery;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/feed}: Home's feed (stage R7 of the phone redesign; owner prompt of
 * 2026-10-19, docs/product/specs/2026-10-19-home-full-design.md, section 5). Signed-in collectors
 * only; guests get Home in stage R15.
 */
@RestController
@Validated
@Tag(name = "feed", description = "Home's feed: what became public in a region (signed in)")
public class FeedController {

    private final FeedService feedService;

    public FeedController(FeedService feedService) {
        this.feedService = feedService;
    }

    @GetMapping(path = "/api/v1/feed", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getFeed",
            summary = "What became public in a region for a game (Home)",
            description =
                    "Posts of discoverable collectors of `region` (default: the caller's home"
                        + " region, else americas-north) for the game `game`, newest first with a"
                        + " cursor, never older than `windowDays` (a server setting, 30 by default;"
                        + " `nextCursor` is null at the end): NEW_CARDS (one collector's public,"
                        + " fresh cards of `game` that became public within the same hour: their"
                        + " number and the newest 4; cards filed in a deck core are left out, the"
                        + " deck core's post covers them), WANTED (a wish of a collector who shows"
                        + " their wishlist) and DECK_CORE (a public, unsold deck core of `game`)."
                        + " Never the caller's own posts, never a collector in a block with the"
                        + " caller in either direction (left out before the limit), never a city or"
                        + " a coordinate: places are a state or province and a country. Card"
                        + " pictures come through /api/v1/public/card-images; nothing is"
                        + " sponsored.")
    @ApiResponse(responseCode = "200", description = "One page of the feed")
    @ApiResponse(
            responseCode = "400",
            description =
                    "VALIDATION_FAILED: game missing or unknown, unknown region or kind, invalid"
                            + " cursor or limit",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = SearchController.PROBLEM_REF)))
    @ApiResponse(
            responseCode = "401",
            description = "Not signed in",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = SearchController.PROBLEM_REF)))
    public FeedPageResponse feed(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(
                            description =
                                    "Platform region code (GET /regions); default: the caller's"
                                            + " home region, else americas-north")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String region,
            @Parameter(
                            required = true,
                            description = "Game slug (GET /games): the phone's browsed game")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String game,
            @Parameter(
                            schema =
                                    @Schema(
                                            allowableValues = {
                                                "ALL",
                                                "NEW_CARDS",
                                                "WANTED",
                                                "DECK_CORES"
                                            },
                                            defaultValue = "ALL"),
                            description = "Every post, or the posts of one kind (Home's chips)")
                    @RequestParam(required = false)
                    @Size(max = 16)
                    @Nullable String kind,
            @Parameter(description = "The `nextCursor` of the previous page")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @Parameter(description = "Posts per page (20 by default)")
                    @RequestParam(required = false)
                    @Min(1)
                    @Max(FeedRules.MAX_LIMIT)
                    @Nullable Integer limit) {
        return FeedPageResponse.from(
                feedService.page(
                        principal.userId(), new FeedQuery(region, game, kind, cursor, limit)));
    }
}
