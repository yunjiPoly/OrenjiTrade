package com.orenjitrade.api.offers.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.offers.api.OfferRequests.AcceptOfferRequest;
import com.orenjitrade.api.offers.api.OfferRequests.CloseOfferRequest;
import com.orenjitrade.api.offers.api.OfferRequests.CounterOfferRequest;
import com.orenjitrade.api.offers.api.OfferRequests.CreateOfferRequest;
import com.orenjitrade.api.offers.api.OfferResponses.OfferResponse;
import com.orenjitrade.api.offers.api.OfferResponses.OfferSummaryResponse;
import com.orenjitrade.api.offers.domain.OfferInputs;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.offers.domain.OfferService;
import com.orenjitrade.api.offers.domain.OfferStatus;
import com.orenjitrade.api.offers.domain.OfferViews.Summary;
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
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/offers} (Phase 8 contract "Endpoints"): make an offer on a public card, the inbox,
 * one offer with its history, counter / accept / decline / cancel. The actor is always the caller;
 * only the two parties of an offer see it.
 */
@RestController
@RequestMapping(path = "/api/v1/offers", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "offers", description = "Cash, trade and mixed offers on public cards")
public class OfferController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final OfferService offerService;
    private final TimeProvider timeProvider;

    public OfferController(OfferService offerService, TimeProvider timeProvider) {
        this.offerService = offerService;
        this.timeProvider = timeProvider;
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "createOffer",
            summary = "Make an offer on a public card",
            description =
                    "CASH (cashAmount), TRADE (tradeItemIds: the buyer's own non-deleted cards,"
                        + " public visibility not required) or MIXED (both). The card must be"
                        + " public and visible to the caller (404 otherwise, blocks included),"
                        + " accept offers and fit the kind: 422 OFFERS_NOT_ACCEPTED for cards"
                        + " without offers, NOT_AVAILABLE / COLLECTION_ONLY cards, cash on"
                        + " trade-only or trades on sale-only cards, and MIXED offers unless the"
                        + " card is TRADE_OR_SALE and the seller accepts mixed offers. One open"
                        + " offer per buyer and card (409 OFFER_ALREADY_OPEN, extension offerId);"
                        + " expiresInHours 1-168 (default 72); offers.per_day of the caller's plan"
                        + " (429 LIMIT_REACHED, FREE 20). The seller gets OFFER_RECEIVED and a"
                        + " SYSTEM message with the offer link appears in the pair conversation. An"
                        + " Idempotency-Key repeats the original answer for 24 hours.")
    @ApiResponse(responseCode = "201", description = "The new offer (OPEN, the seller's turn)")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND (card not visible) or FEATURE_DISABLED (payment protection)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "OFFER_ALREADY_OPEN",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "422",
            description = "OFFERS_NOT_ACCEPTED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "429",
            description = "LIMIT_REACHED (offers.per_day)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<OfferResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(description = "Optional retry key (24 h)")
                    @RequestHeader(name = "Idempotency-Key", required = false)
                    @Nullable String idempotencyKey,
            @Valid @RequestBody CreateOfferRequest body) {
        OfferService.Created created =
                offerService.create(
                        principal.userId(),
                        new OfferInputs.Create(
                                body.itemId(),
                                body.kind(),
                                body.cashAmount(),
                                body.currency(),
                                body.lines(),
                                body.message(),
                                body.expiresInHours(),
                                Boolean.TRUE.equals(body.protectionRequested())),
                        idempotencyKey);
        OfferResponse response = OfferResponse.from(created.offer(), timeProvider.now());
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/offers/" + response.id()))
                .body(response);
    }

    @GetMapping
    @Operation(
            operationId = "listOffers",
            summary = "The caller's offers (sent and received)",
            description =
                    "The live proposal of each negotiation, most recent activity first,"
                            + " cursor-paginated. role=buyer lists the offers the caller made,"
                            + " role=seller the offers on the caller's cards (both when absent);"
                            + " status filters (repeat or comma-separate, e.g. OPEN,COUNTERED).")
    @ApiResponse(responseCode = "200", description = "One slice of offers")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (role, status, cursor or limit)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<OfferSummaryResponse> list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(
                            description = "buyer: offers made; seller: offers received",
                            schema = @Schema(allowableValues = {"buyer", "seller"}))
                    @RequestParam(required = false)
                    @Nullable String role,
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable List<OfferStatus> status,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + OfferService.DEFAULT_LIMIT)
                    @Min(1)
                    @Max(OfferService.MAX_LIMIT)
                    int limit) {
        CursorPage<Summary> page =
                offerService.list(
                        principal.userId(),
                        role(role),
                        status == null ? List.of() : status,
                        cursor,
                        limit);
        Instant now = timeProvider.now();
        return new CursorPage<>(
                page.items().stream()
                        .map(summary -> OfferSummaryResponse.from(summary, now))
                        .toList(),
                page.nextCursor(),
                page.hasMore());
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getOffer",
            summary = "One offer with its history",
            description =
                    "Parties only (404 for anybody else). history covers the whole counter chain;"
                            + " latestOfferId points at the live proposal when a counter-offer"
                            + " replaced this one; allowedActions says what the caller may do now.")
    @ApiResponse(responseCode = "200", description = "The offer")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public OfferResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return OfferResponse.from(offerService.get(principal.userId(), id), timeProvider.now());
    }

    @PostMapping(path = "/{id}/counter", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "counterOffer",
            summary = "Counter an offer",
            description =
                    "Only the party whose turn it is (409 NOT_YOUR_TURN). Creates a new proposal"
                        + " (status COUNTERED, the other party's turn, fresh expiry) linked to the"
                        + " answered one, which becomes COUNTERED and superseded. Cards are always"
                        + " the buyer's; the buyer's counter-offers follow the card's availability"
                        + " (422 OFFERS_NOT_ACCEPTED). 409 STALE_OFFER for a superseded proposal or"
                        + " another version, 409 INVALID_STATE_TRANSITION for closed offers, 403"
                        + " TRADING_BLOCKED for a block or an inactive party. The other party gets"
                        + " OFFER_COUNTERED.")
    @ApiResponse(responseCode = "200", description = "The new counter-offer")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "403",
            description = "TRADING_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description =
                    "STALE_OFFER, NOT_YOUR_TURN, INVALID_STATE_TRANSITION or ITEM_UNAVAILABLE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "422",
            description = "OFFERS_NOT_ACCEPTED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public OfferResponse counter(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody CounterOfferRequest body) {
        return OfferResponse.from(
                offerService.counter(
                        principal.userId(),
                        id,
                        new OfferInputs.Counter(
                                body.kind(),
                                body.cashAmount(),
                                body.currency(),
                                body.lines(),
                                body.message(),
                                body.expiresInHours(),
                                body.version())),
                timeProvider.now());
    }

    @PostMapping("/{id}/accept")
    @Operation(
            operationId = "acceptOffer",
            summary = "Accept an offer",
            description =
                    "Only the party whose turn it is. Opens the trade (tradeId): AGREED, or"
                        + " AWAITING_PAYMENT when the buyer asked for payment protection and the"
                        + " protectedPayments feature is on. Records the OFFER_ACCEPTED interaction"
                        + " (both parties may rate each other) and notifies both. 409"
                        + " ITEM_UNAVAILABLE when the card left the seller's inventory, a traded"
                        + " card left the buyer's, or every copy is promised in open trades.")
    @ApiResponse(responseCode = "200", description = "The accepted offer with its tradeId")
    @ApiResponse(
            responseCode = "403",
            description = "TRADING_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description =
                    "STALE_OFFER, NOT_YOUR_TURN, INVALID_STATE_TRANSITION or ITEM_UNAVAILABLE",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public OfferResponse accept(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable AcceptOfferRequest body) {
        return OfferResponse.from(
                offerService.accept(principal.userId(), id, body == null ? null : body.version()),
                timeProvider.now());
    }

    @PostMapping("/{id}/decline")
    @Operation(
            operationId = "declineOffer",
            summary = "Decline an offer",
            description =
                    "Only the party whose turn it is (the seller for an OPEN offer). Optional"
                            + " reason (≤ 500) shown to the other party, who gets OFFER_DECLINED.")
    @ApiResponse(responseCode = "200", description = "The declined offer")
    @ApiResponse(
            responseCode = "409",
            description = "STALE_OFFER, NOT_YOUR_TURN or INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public OfferResponse decline(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable CloseOfferRequest body) {
        return OfferResponse.from(
                offerService.decline(
                        principal.userId(),
                        id,
                        body == null ? null : body.version(),
                        body == null ? null : body.reason()),
                timeProvider.now());
    }

    @PostMapping("/{id}/cancel")
    @Operation(
            operationId = "cancelOffer",
            summary = "Withdraw an offer",
            description =
                    "The buyer only (403 for the seller), while the offer is OPEN (409"
                            + " INVALID_STATE_TRANSITION once countered or closed). The seller gets"
                            + " OFFER_CANCELLED.")
    @ApiResponse(responseCode = "200", description = "The withdrawn offer")
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN (the seller)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "STALE_OFFER or INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public OfferResponse cancel(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable CloseOfferRequest body) {
        return OfferResponse.from(
                offerService.cancel(
                        principal.userId(),
                        id,
                        body == null ? null : body.version(),
                        body == null ? null : body.reason()),
                timeProvider.now());
    }

    private static @Nullable OfferRole role(@Nullable String role) {
        if (role == null || role.isBlank()) {
            return null;
        }
        return switch (role.trim().toLowerCase(Locale.ROOT)) {
            case "buyer" -> OfferRole.BUYER;
            case "seller" -> OfferRole.SELLER;
            default ->
                    throw ApiException.validation(
                            "Validation failed",
                            List.of(new ProblemFieldError("role", "must be buyer or seller")));
        };
    }
}
