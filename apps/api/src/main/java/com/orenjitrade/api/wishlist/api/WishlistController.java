package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.PartialUpdate;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.wishlist.api.WishlistRequests.CreateWishlistItemRequest;
import com.orenjitrade.api.wishlist.api.WishlistRequests.UpdateWishlistItemRequest;
import com.orenjitrade.api.wishlist.api.WishlistResponses.WishlistItemResponse;
import com.orenjitrade.api.wishlist.api.WishlistResponses.WishlistMatchResponse;
import com.orenjitrade.api.wishlist.domain.TradePreference;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.WishlistPatch;
import com.orenjitrade.api.wishlist.domain.WishlistMatchView;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * {@code /api/v1/wishlist}: the caller's wishlist and its matches (owner only; other users' items
 * and matches are 404).
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/wishlist", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "wishlist", description = "The caller's wishlist and its matches in their region")
public class WishlistController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    /** Members of {@link UpdateWishlistItemRequest}. */
    static final List<String> PATCH_FIELDS =
            List.of(
                    "printingId",
                    "rarity",
                    "conditionMin",
                    "edition",
                    "language",
                    "maxPrice",
                    "currency",
                    "tradePreference",
                    "notes",
                    "active");

    private final WishlistService wishlistService;
    private final TimeProvider timeProvider;

    public WishlistController(WishlistService wishlistService, TimeProvider timeProvider) {
        this.wishlistService = wishlistService;
        this.timeProvider = timeProvider;
    }

    @GetMapping
    @Operation(operationId = "listWishlist", summary = "The caller's wishlist items (newest first)")
    @ApiResponse(responseCode = "200", description = "Every item of the caller")
    public List<WishlistItemResponse> list(@AuthenticationPrincipal AuthenticatedUser principal) {
        return wishlistService.list(principal.userId()).stream()
                .map(WishlistItemResponse::from)
                .toList();
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createWishlistItem",
            summary = "Add a card to the wishlist",
            description =
                    "cardId (any printing) or printingId is required. The new item is matched at"
                        + " once against the public inventory of collectors in the caller's"
                        + " platform region (no notification; see matchCount and GET"
                        + " /wishlist/{id}/matches); later publications notify (WISHLIST_MATCH)."
                        + " 409 CONFLICT for an identical wish; 429 LIMIT_REACHED beyond"
                        + " wishlist.items.max (FREE 20, PREMIUM 500).")
    @ApiResponse(responseCode = "201", description = "The new item")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (target, vocabularies, price, notes)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: the same card with the same filters is already wished",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (wishlist.items.max)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<WishlistItemResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CreateWishlistItemRequest body) {
        WishlistItemResponse created =
                WishlistItemResponse.from(wishlistService.create(principal.userId(), body.toNew()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/wishlist/" + created.id()))
                .body(created);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateWishlistItem",
            summary = "Update a wishlist item (any subset of the fields)",
            description =
                    "Absent fields are unchanged. Changing the criteria re-matches the item"
                            + " (dismissed matches stay dismissed).",
            requestBody =
                    @io.swagger.v3.oas.annotations.parameters.RequestBody(
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_JSON_VALUE,
                                            schema =
                                                    @Schema(
                                                            implementation =
                                                                    UpdateWishlistItemRequest
                                                                            .class))))
    @ApiResponse(responseCode = "200", description = "The updated item")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown item or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WishlistItemResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestBody JsonNode body) {
        PartialUpdate patch =
                PartialUpdate.of(body).notNull("currency", "tradePreference", "active");
        Set<String> present = new HashSet<>();
        for (String field : PATCH_FIELDS) {
            if (patch.has(field)) {
                present.add(field);
            }
        }
        WishlistPatch wishlistPatch =
                new WishlistPatch(
                        present,
                        patch.uuid("printingId"),
                        patch.text("rarity"),
                        patch.text("conditionMin"),
                        patch.text("edition"),
                        patch.text("language"),
                        patch.decimal("maxPrice"),
                        patch.text("currency"),
                        patch.enumValue("tradePreference", TradePreference.class),
                        patch.text("notes"),
                        patch.bool("active"));
        patch.throwIfInvalid();
        return WishlistItemResponse.from(
                wishlistService.update(principal.userId(), id, wishlistPatch));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "deleteWishlistItem",
            summary = "Remove a wishlist item",
            description = "Its matches are removed with it.")
    @ApiResponse(responseCode = "204", description = "Removed")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown item or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        wishlistService.delete(principal.userId(), id);
    }

    @GetMapping("/{id}/matches")
    @Operation(
            operationId = "listWishlistMatches",
            summary = "Public items matching a wishlist item (newest first)",
            description =
                    "Cursor-paginated. Each match carries the public item (never private notes),"
                        + " the owner's marker (state/province and country, never a city or a"
                        + " distance). Items that stopped being public and collectors blocked in"
                        + " either direction are left out; dismissed matches only with"
                        + " includeDismissed=true.")
    @ApiResponse(responseCode = "200", description = "One slice of matches")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (invalid cursor or limit)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown item or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<WishlistMatchResponse> matches(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + WishlistService.MATCHES_DEFAULT_LIMIT)
                    @Min(1)
                    @Max(WishlistService.MATCHES_MAX_LIMIT)
                    int limit,
            @Parameter(description = "true: also list dismissed matches")
                    @RequestParam(defaultValue = "false")
                    boolean includeDismissed) {
        CursorPage<WishlistMatchView> page =
                wishlistService.matches(principal.userId(), id, cursor, limit, includeDismissed);
        Instant now = timeProvider.now();
        return new CursorPage<>(
                page.items().stream().map(view -> WishlistMatchResponse.from(view, now)).toList(),
                page.nextCursor(),
                page.hasMore());
    }

    @PostMapping("/matches/{id}/dismiss")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(
            operationId = "dismissWishlistMatch",
            summary = "Dismiss a match",
            description = "Idempotent; a dismissed match never comes back for this wishlist item.")
    @ApiResponse(responseCode = "204", description = "Dismissed")
    @ApiResponse(
            responseCode = "404",
            description = "Unknown match or not the caller's",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public void dismiss(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        wishlistService.dismiss(principal.userId(), id);
    }
}
