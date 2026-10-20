package com.orenjitrade.api.wishlist.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.PartialUpdate;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.games.domain.GameCatalog;
import com.orenjitrade.api.wishlist.api.WishlistRequests.CreateWishlistItemRequest;
import com.orenjitrade.api.wishlist.api.WishlistRequests.UpdateWishlistItemRequest;
import com.orenjitrade.api.wishlist.api.WishlistResponses.PriceTermsResponse;
import com.orenjitrade.api.wishlist.api.WishlistResponses.WishlistAvailabilityResponse;
import com.orenjitrade.api.wishlist.api.WishlistResponses.WishlistItemResponse;
import com.orenjitrade.api.wishlist.domain.WishlistChanges.WishlistPatch;
import com.orenjitrade.api.wishlist.domain.WishlistItemView;
import com.orenjitrade.api.wishlist.domain.WishlistService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.net.URI;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
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
 * {@code /api/v1/wishlist}: the caller's wishlist (owner only; other users' items are 404) and the
 * price terms a wish may choose.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1/wishlist", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "wishlist", description = "The caller's wishlist")
public class WishlistController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    /** Members of {@link UpdateWishlistItemRequest}. */
    static final List<String> PATCH_FIELDS =
            List.of("printingId", "rarity", "note", "nearMintOnly", "priceTerm");

    private final WishlistService wishlistService;
    private final GameCatalog games;

    public WishlistController(WishlistService wishlistService, GameCatalog games) {
        this.wishlistService = wishlistService;
        this.games = games;
    }

    @GetMapping
    @Operation(
            operationId = "listWishlist",
            summary = "The caller's wishlist items (newest first)",
            description =
                    "Each item says whether it is `available` in the caller's home region (stage"
                        + " R5; GET /wishlist/availability answers for any region): at least one"
                        + " public, fresh (ACTIVE or AGING) copy that fits the wish (its printing,"
                        + " or any printing of its card in its rarity; Near Mint or a condition not"
                        + " stated when the wish asks for Near Mint only, as for the wishlist"
                        + " alert), a card listed on its own or in a public deck core, held by a"
                        + " discoverable collector of the region who is not the caller and with no"
                        + " block either way. One grouped query for the whole list. No count.")
    @ApiResponse(responseCode = "200", description = "Every item of the caller")
    public List<WishlistItemResponse> list(@AuthenticationPrincipal AuthenticatedUser principal) {
        WishlistService.Listing listing =
                wishlistService.listWithAvailability(principal.userId(), null);
        return listing.items().stream()
                .map(
                        view ->
                                WishlistItemResponse.from(
                                        view, listing.available().contains(view.row().id())))
                .toList();
    }

    @GetMapping("/availability")
    @Operation(
            operationId = "getWishlistAvailability",
            summary = "Which of the caller's wishes are available in a region",
            description =
                    "The ids of the caller's wishes that `available` would mark in `region`"
                        + " (default: the caller's home region, else americas-north): the phone's"
                        + " Wishlist segment of Search asks it for the region it browses (stage"
                        + " R5). The same rules as `available` on GET /wishlist, one grouped query."
                        + " Ids only: no count, no holder, no place. `game` (stage G) keeps the"
                        + " wishes of that game only.")
    @ApiResponse(responseCode = "200", description = "The available wishes")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED: unknown region or game",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WishlistAvailabilityResponse availability(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(
                            description =
                                    "Platform region code (GET /regions); default: the caller's"
                                            + " home region, else americas-north")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String region,
            @Parameter(
                            description =
                                    "Game slug (GET /games): only the wishes of that game (stage"
                                            + " G, the phone's browsed game)")
                    @RequestParam(required = false)
                    @Size(max = 32)
                    @Nullable String game) {
        @Nullable String gameSlug =
                game == null || game.isBlank() ? null : game.trim().toLowerCase(Locale.ROOT);
        if (gameSlug != null && !games.isKnown(gameSlug)) {
            throw ApiException.validation(
                    "Validation failed", List.of(new ProblemFieldError("game", "unknown game")));
        }
        WishlistService.Listing listing =
                wishlistService.listWithAvailability(principal.userId(), region);
        return new WishlistAvailabilityResponse(
                listing.region(),
                listing.items().stream()
                        .filter(view -> gameSlug == null || gameSlug.equals(view.row().gameSlug()))
                        .map(view -> view.row().id())
                        .filter(listing.available()::contains)
                        .toList());
    }

    /** A written item with its availability in the caller's home region. */
    private WishlistItemResponse written(UUID ownerId, WishlistItemView view) {
        return WishlistItemResponse.from(
                view,
                wishlistService.availableAtHome(ownerId, List.of(view)).contains(view.row().id()));
    }

    @GetMapping("/price-terms")
    @Operation(
            operationId = "listWishPriceTerms",
            summary = "The price terms a wish may choose",
            description =
                    "Admin-configured (platform setting wishlist.price_terms), in display order."
                            + " Terms are relative to the TCG market price of the printing.")
    @ApiResponse(responseCode = "200", description = "The terms")
    public PriceTermsResponse priceTerms() {
        return PriceTermsResponse.from(wishlistService.priceTerms());
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createWishlistItem",
            summary = "Add a card to the wishlist",
            description =
                    "Which copy (cardId for any printing, optionally with a rarity of the card's"
                        + " printings, or printingId), a public note, nearMintOnly and a price"
                        + " term. When a collector of the caller's platform region later lists a"
                        + " fitting public item, the caller gets a WISHLIST_ALERT (notification"
                        + " settings: wishlistAlerts). 409 CONFLICT for the same selection twice;"
                        + " 429 LIMIT_REACHED beyond wishlist.items.max (20 for everyone by"
                        + " default; an admin setting). Unknown members (such as the removed"
                        + " maxPrice or tradePreference) are ignored.")
    @ApiResponse(responseCode = "201", description = "The new item")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (target, rarity, note, price term)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: the same card, printing and rarity is already wished",
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
                written(
                        principal.userId(),
                        wishlistService.create(principal.userId(), body.toNew()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/wishlist/" + created.id()))
                .body(created);
    }

    @PatchMapping(path = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "updateWishlistItem",
            summary = "Update a wishlist item (any subset of the fields)",
            description = "Absent fields are unchanged; unknown members are ignored.",
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
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT: the new selection is already wished",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WishlistItemResponse update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @RequestBody JsonNode body) {
        PartialUpdate patch = PartialUpdate.of(body).notNull("nearMintOnly");
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
                        patch.text("note"),
                        patch.bool("nearMintOnly"),
                        patch.text("priceTerm"));
        patch.throwIfInvalid();
        return written(
                principal.userId(), wishlistService.update(principal.userId(), id, wishlistPatch));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteWishlistItem", summary = "Remove a wishlist item")
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
}
