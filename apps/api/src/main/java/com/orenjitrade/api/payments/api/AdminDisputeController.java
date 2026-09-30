package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.PageResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.AdminDisputeResponse;
import com.orenjitrade.api.payments.api.AdminPaymentResponses.DisputeSummaryResponse;
import com.orenjitrade.api.payments.api.PaymentRequests.FreezeRequest;
import com.orenjitrade.api.payments.api.PaymentRequests.NoteRequest;
import com.orenjitrade.api.payments.api.PaymentRequests.ResolveRequest;
import com.orenjitrade.api.payments.domain.DisputeService;
import com.orenjitrade.api.payments.domain.DisputeStatus;
import com.orenjitrade.api.payments.domain.DisputeViews.AdminDisputeLine;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /api/v1/admin/disputes} (ADMIN, SUPER_ADMIN; Phase 9 contract "Admin"): the dispute queue,
 * the full history of a dispute (both parties' account histories, ratings, reports, internal notes,
 * payment and webhook history), freeze / unfreeze, internal notes and the resolution. Every write
 * is audited ({@code dispute.*}).
 */
@RestController
@RequestMapping(path = "/api/v1/admin/disputes", produces = MediaType.APPLICATION_JSON_VALUE)
@Validated
@Tag(name = "admin-payments", description = "Admin: transactions, payments, disputes, webhooks")
public class AdminDisputeController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final DisputeService disputes;
    private final JsonMapper jsonMapper;

    public AdminDisputeController(DisputeService disputes, JsonMapper jsonMapper) {
        this.disputes = disputes;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping
    @Operation(
            operationId = "listAdminDisputes",
            summary = "The dispute queue (ADMIN)",
            description = "Newest first; status filters.")
    public PageResponse<DisputeSummaryResponse> list(
            @Parameter(description = "Status filter") @RequestParam(required = false)
                    @Nullable DisputeStatus status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        PageResponse<AdminDisputeLine> lines = disputes.adminList(status, page, size);
        return new PageResponse<>(
                lines.items().stream().map(DisputeSummaryResponse::from).toList(),
                lines.page(),
                lines.size(),
                lines.totalItems(),
                lines.totalPages());
    }

    @GetMapping("/{id}")
    @Operation(
            operationId = "getAdminDispute",
            summary = "A dispute with its full history (ADMIN)",
            description =
                    "The member view plus internal notes, the trade timeline, payment events,"
                            + " refunds, webhooks, both parties' moderation histories (reports,"
                            + " ratings, suspensions) and rating summaries.")
    @ApiResponse(responseCode = "200", description = "The dispute")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDisputeResponse get(@PathVariable UUID id) {
        return AdminDisputeResponse.from(disputes.adminGet(id), jsonMapper);
    }

    @PostMapping("/{id}/freeze")
    @Operation(
            operationId = "freezeDispute",
            summary = "Hold a dispute (ADMIN)",
            description =
                    "OPEN or UNDER_REVIEW → FROZEN: the payout stays frozen and the parties can no"
                        + " longer add evidence or messages; an optional reason becomes an internal"
                        + " note. Audited (dispute.freeze). 409 INVALID_STATE_TRANSITION"
                        + " otherwise.")
    @ApiResponse(responseCode = "200", description = "The dispute")
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDisputeResponse freeze(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable FreezeRequest body) {
        return AdminDisputeResponse.from(
                disputes.freeze(admin, id, body == null ? null : body.reason()), jsonMapper);
    }

    @PostMapping("/{id}/unfreeze")
    @Operation(
            operationId = "unfreezeDispute",
            summary = "Lift the hold of a dispute (ADMIN)",
            description =
                    "FROZEN → UNDER_REVIEW (the payout stays frozen until the resolution)."
                            + " Audited (dispute.unfreeze).")
    @ApiResponse(responseCode = "200", description = "The dispute")
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDisputeResponse unfreeze(
            @AuthenticationPrincipal AuthenticatedUser admin, @PathVariable UUID id) {
        return AdminDisputeResponse.from(disputes.unfreeze(admin, id), jsonMapper);
    }

    @PostMapping(path = "/{id}/notes", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "addDisputeNote",
            summary = "Add an internal note (ADMIN)",
            description =
                    "Never shown to the parties; the first note moves an OPEN dispute to"
                            + " UNDER_REVIEW. Audited (dispute.note, without the text).")
    @ApiResponse(responseCode = "200", description = "The dispute")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDisputeResponse addNote(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @PathVariable UUID id,
            @Valid @RequestBody NoteRequest body) {
        return AdminDisputeResponse.from(disputes.addNote(admin, id, body.body()), jsonMapper);
    }

    @PostMapping(path = "/{id}/resolve", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "resolveDispute",
            summary = "Resolve a dispute (ADMIN)",
            description =
                    "BUYER: the whole refundable amount goes back to the buyer through the"
                        + " provider, the trade is CANCELLED. SELLER: the payout is released, the"
                        + " trade COMPLETED. SPLIT: refundAmount (more than 0, less than the"
                        + " refundable amount) is refunded, the rest paid out minus the fee on it,"
                        + " the trade COMPLETED. The note is shown to both parties. Audited"
                        + " (dispute.resolve). 409 when already resolved or the payment is no"
                        + " longer held.")
    @ApiResponse(responseCode = "200", description = "The resolved dispute")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (refundAmount, note)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION, CONFLICT",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public AdminDisputeResponse resolve(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @PathVariable UUID id,
            @Valid @RequestBody ResolveRequest body) {
        return AdminDisputeResponse.from(
                disputes.resolve(admin, id, body.outcome(), body.refundAmount(), body.note()),
                jsonMapper);
    }
}
