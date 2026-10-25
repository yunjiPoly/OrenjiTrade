package com.orenjitrade.api.search.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.binders.domain.PublicOwner;
import com.orenjitrade.api.search.domain.ListingOwnerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/v1/listings/owner} (stage R15 of the phone redesign, "Browse without an
 * account"): who owns a public card, binder or wish, for a signed-in member. The phone keeps a
 * guest's action by the listing it was about (a guest never gets a collector id) and finishes it
 * with this once the guest has signed in: the chat with the card pinned, "I have it", the
 * collector's profile.
 */
@RestController
@Tag(name = "listings", description = "Who owns a public listing (signed in)")
public class ListingOwnerController {

    private final ListingOwnerService listingOwnerService;

    public ListingOwnerController(ListingOwnerService listingOwnerService) {
        this.listingOwnerService = listingOwnerService;
    }

    @GetMapping(path = "/api/v1/listings/owner", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getListingOwner",
            summary = "Who owns a public card, binder or wish (signed in)",
            description =
                    "Exactly one of `itemId` (a public inventory item), `binderId` (a public binder"
                        + " or deck core) and `wishId` (a wish its owner shows). The collector as"
                        + " members see them in card holders, a public binder or Home's feed: id,"
                        + " handle, display name and avatar; no place. 404 when the listing is not"
                        + " public right now, its owner is hidden (suspended, pending deletion,"
                        + " PRIVATE profile) or a block exists either way. The caller's own listing"
                        + " names the caller. For stage R15: a guest's action, kept by its listing,"
                        + " finishes once the guest has signed in.")
    @ApiResponse(responseCode = "200", description = "The owner")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED: not exactly one of itemId, binderId, wishId",
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
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND: not public, hidden owner or a block",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = SearchController.PROBLEM_REF)))
    public ListingOwnerResponse owner(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "A public inventory item") @RequestParam(required = false)
                    @Nullable UUID itemId,
            @Parameter(description = "A public binder or deck core") @RequestParam(required = false)
                    @Nullable UUID binderId,
            @Parameter(description = "A wish its owner shows") @RequestParam(required = false)
                    @Nullable UUID wishId) {
        return ListingOwnerResponse.from(
                listingOwnerService.ownerOf(principal.userId(), itemId, binderId, wishId));
    }

    /** The owner of a public listing, as members see them (never a place, a city or a point). */
    @Schema(name = "PublicListingOwner", description = "The collector who owns a public listing")
    public record ListingOwnerResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID id,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "maika") String handle,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "Maïka Tremblay")
                    String displayName,
            @Schema(nullable = true, format = "uri") @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String avatarUrl) {

        static ListingOwnerResponse from(PublicOwner owner) {
            return new ListingOwnerResponse(
                    owner.id(), owner.handle(), owner.displayName(), owner.avatarUrl());
        }
    }
}
