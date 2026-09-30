package com.orenjitrade.api.trades.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.CursorPage;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.offers.domain.OfferRole;
import com.orenjitrade.api.trades.api.TradeResponses.TradeResponse;
import com.orenjitrade.api.trades.api.TradeResponses.TradeSummaryResponse;
import com.orenjitrade.api.trades.domain.TradeService;
import com.orenjitrade.api.trades.domain.TradeStatus;
import com.orenjitrade.api.trades.domain.TradeViews.Summary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/trades} (Phase 8 contract "Trades"): the caller's trades, the trade page with its
 * next action, meetup, completion and cancellation. Payment, shipping and receipt confirmation are
 * Phase 9. Only the two parties see a trade.
 */
@RestController
@RequestMapping(path = "/api/v1/trades", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "trades", description = "Trades created from accepted offers")
public class TradeController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final TradeService tradeService;
    private final TimeProvider timeProvider;

    public TradeController(TradeService tradeService, TimeProvider timeProvider) {
        this.tradeService = tradeService;
        this.timeProvider = timeProvider;
    }

    @GetMapping
    @Operation(
            operationId = "listTrades",
            summary = "The caller's trades",
            description =
                    "Most recent activity first, cursor-paginated. role=buyer / seller filters the"
                            + " caller's side (both when absent); status filters (repeat or"
                            + " comma-separate).")
    @ApiResponse(responseCode = "200", description = "One slice of trades")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (role, status, cursor or limit)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CursorPage<TradeSummaryResponse> list(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Parameter(
                            description = "buyer or seller",
                            schema = @Schema(allowableValues = {"buyer", "seller"}))
                    @RequestParam(required = false)
                    @Nullable String role,
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable List<TradeStatus> status,
            @Parameter(description = "Opaque cursor of the previous slice")
                    @RequestParam(required = false)
                    @Size(max = 200)
                    @Nullable String cursor,
            @RequestParam(defaultValue = "" + TradeService.DEFAULT_LIMIT)
                    @Min(1)
                    @Max(TradeService.MAX_LIMIT)
                    int limit) {
        CursorPage<Summary> page =
                tradeService.list(
                        principal.userId(),
                        role(role),
                        status == null ? List.of() : status,
                        cursor,
                        limit);
        Instant now = timeProvider.now();
        return new CursorPage<>(
                page.items().stream()
                        .map(summary -> TradeSummaryResponse.from(summary, now))
                        .toList(),
                page.nextCursor(),
                page.hasMore());
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getTrade",
            summary = "One trade with its timeline and next action",
            description =
                    "Parties only (404 for anybody else). nextAction: AGREED trades MEET (each"
                        + " party meets or exchanges, then confirms), AWAITING_PAYMENT the buyer"
                        + " PAYs, PAID the seller SHIPs, SHIPPED the buyer CONFIRM_RECEIPTs (the"
                        + " last three are Phase 9), NONE otherwise. payment and dispute are null"
                        + " until Phase 9.")
    @ApiResponse(responseCode = "200", description = "The trade")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public TradeResponse get(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return TradeResponse.from(tradeService.get(principal.userId(), id), timeProvider.now());
    }

    @PostMapping("/{id}/meetup")
    @Operation(
            operationId = "markTradeMeetup",
            summary = "Mark the trade as an in-person meetup",
            description =
                    "AGREED or AWAITING_PAYMENT trades; idempotent per party. Once both parties"
                            + " marked it, meetup is true and payment protection is dropped"
                            + " (AWAITING_PAYMENT goes back to AGREED). The other party gets"
                            + " TRADE_UPDATE. 409 INVALID_STATE_TRANSITION otherwise.")
    @ApiResponse(responseCode = "200", description = "The trade")
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public TradeResponse meetup(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return TradeResponse.from(
                tradeService.markMeetup(principal.userId(), id), timeProvider.now());
    }

    @PostMapping("/{id}/complete")
    @Operation(
            operationId = "completeTrade",
            summary = "Confirm the exchange",
            description =
                    "AGREED trades; idempotent per party. When both parties confirmed, the trade is"
                        + " COMPLETED: the seller's card leaves their inventory (quantity −1,"
                        + " removed at 0), the buyer's trade cards leave theirs, and the TRADE"
                        + " interaction lets both parties rate each other; the received cards can"
                        + " be added with POST /inventory/items. Protected trades complete when the"
                        + " buyer confirms receipt (Phase 9): 409 INVALID_STATE_TRANSITION.")
    @ApiResponse(responseCode = "200", description = "The trade")
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public TradeResponse complete(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return TradeResponse.from(
                tradeService.complete(principal.userId(), id), timeProvider.now());
    }

    @PostMapping(path = "/{id}/cancel", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "cancelTrade",
            summary = "Cancel a trade before any payment",
            description =
                    "Either party, while AGREED or AWAITING_PAYMENT (409"
                            + " INVALID_STATE_TRANSITION otherwise); the required reason (≤ 500)"
                            + " is shown to the other party, who gets TRADE_UPDATE.")
    @ApiResponse(responseCode = "200", description = "The cancelled trade")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public TradeResponse cancel(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody CancelTradeRequest body) {
        return TradeResponse.from(
                tradeService.cancel(principal.userId(), id, body.reason()), timeProvider.now());
    }

    /** Body of {@code POST /trades/{id}/cancel}. */
    @Schema(name = "CancelTradeRequest")
    public record CancelTradeRequest(
            @Schema(
                            requiredMode = Schema.RequiredMode.REQUIRED,
                            description = "Reason shown to the other party",
                            maxLength = 500)
                    @NotBlank
                    @Size(max = 500)
                    String reason) {}

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
