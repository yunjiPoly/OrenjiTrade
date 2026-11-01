package com.orenjitrade.api.deals.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.deals.api.SaleRequests.MarkSoldRequest;
import com.orenjitrade.api.deals.domain.SaleService;
import com.orenjitrade.api.deals.domain.SaleView;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Mark as sold (stage R4 of the phone redesign; ADR 0018): {@code POST
 * /api/v1/conversations/{id}/sales} and {@code POST /api/v1/sales/{id}/undo}. The seller only; the
 * payment happens outside OrenjiTrade.
 */
@RestController
@Validated
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "deals", description = "Mark as sold: sales recorded from a chat, and their undo")
public class SaleController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final SaleService saleService;

    public SaleController(SaleService saleService) {
        this.saleService = saleService;
    }

    @PostMapping(path = "/conversations/{id}/sales", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "markSold",
            summary = "Mark the chat's card or deck core as sold to the other collector",
            description =
                    "The seller only: the chat's subject must be the caller's (403 FORBIDDEN"
                        + " otherwise; 409 CONFLICT for a chat without one). The copies sold leave"
                        + " the inventory (at 0 the card leaves it; a deck core is hidden with its"
                        + " cards); a SALE interaction lets both rate at once; a SYSTEM message"
                        + " both read (key sale:<id>:SOLD) and an in-app notification for the"
                        + " buyer. 409 NOTHING_LEFT_TO_SELL when no copy is left (also for the"
                        + " second of two sales of the last copy); 409 SUBJECT_CHANGED when"
                        + " subjectItemId or subjectBinderId (what the seller's chat shows) is no"
                        + " longer the chat's subject; 400 for copies below 1 or above those held,"
                        + " a malformed tracking number and both subjects at once; 404 for"
                        + " non-participants and chats hidden by a block. OrenjiTrade never handles"
                        + " the payment.")
    @ApiResponse(responseCode = "201", description = "The sale")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN (not the seller) or MESSAGING_BLOCKED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown conversation (or not a participant, or hidden by a block)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description =
                    "NOTHING_LEFT_TO_SELL, SUBJECT_CHANGED, or CONFLICT for a chat without a"
                            + " subject",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SaleView markSold(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody MarkSoldRequest body) {
        return saleService.markSold(
                principal.userId(),
                id,
                body.quantity(),
                body.trackingNumber(),
                body.subjectItemId(),
                body.subjectBinderId());
    }

    @PostMapping("/sales/{id}/undo")
    @Operation(
            operationId = "undoSale",
            summary = "Undo a sale (the seller, within 10 minutes, before anyone rated it)",
            description =
                    "Puts back exactly what the sale took (copies; the card with its binder,"
                        + " visibility, price, note and photos; a deck core with its cards),"
                        + " removes its SALE interaction, withdraws its message (pushed to both"
                        + " marked undone) and the buyer's notification. 403 for the buyer, 404 for"
                        + " anyone else; 409 SALE_UNDO_CLOSED after 10 minutes (extension"
                        + " undoableUntil) or when what it took cannot come back; 409"
                        + " SALE_ALREADY_RATED once one of them rated it. A repeated undo answers"
                        + " the undone sale.")
    @ApiResponse(responseCode = "200", description = "The undone sale")
    @ApiResponse(
            responseCode = "403",
            description = "FORBIDDEN (the buyer)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "Unknown sale",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "SALE_UNDO_CLOSED or SALE_ALREADY_RATED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SaleView undo(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return saleService.undo(principal.userId(), id);
    }
}
