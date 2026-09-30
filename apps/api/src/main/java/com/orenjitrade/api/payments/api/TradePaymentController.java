package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.payments.api.DisputeResponses.DisputeResponse;
import com.orenjitrade.api.payments.api.PaymentRequests.OpenDisputeRequest;
import com.orenjitrade.api.payments.api.PaymentRequests.ShipRequest;
import com.orenjitrade.api.payments.api.PaymentResponses.PayResponse;
import com.orenjitrade.api.payments.domain.DisputeService;
import com.orenjitrade.api.payments.domain.ProtectedPaymentService;
import com.orenjitrade.api.trades.api.TradeResponses.TradeResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * The protected steps of a trade (Phase 9 contract, feature flag {@code protectedPayments}
 * evaluated for the trade's buyer): {@code POST /trades/{id}/pay}, {@code /ship}, {@code
 * /confirm-receipt} and {@code /disputes}. Only the two parties reach them (404 otherwise).
 */
@RestController
@RequestMapping(path = "/api/v1/trades", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "payments", description = "Payment protection: payouts, checkout, shipping, receipt")
public class TradePaymentController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ProtectedPaymentService payments;
    private final DisputeService disputes;
    private final TimeProvider timeProvider;
    private final JsonMapper jsonMapper;

    public TradePaymentController(
            ProtectedPaymentService payments,
            DisputeService disputes,
            TimeProvider timeProvider,
            JsonMapper jsonMapper) {
        this.payments = payments;
        this.disputes = disputes;
        this.timeProvider = timeProvider;
        this.jsonMapper = jsonMapper;
    }

    @PostMapping("/{id}/pay")
    @Operation(
            operationId = "payTrade",
            summary = "Start the protected checkout (buyer)",
            description =
                    "AWAITING_PAYMENT protected trades; the seller's payout account must be ACTIVE"
                        + " (409 SELLER_NOT_ONBOARDED). Creates the payment through the provider"
                        + " and answers where to pay: checkoutUrl (fake provider: the web path"
                        + " /checkout/fake/<ref>) or clientSecret (Stripe). Repeating the call"
                        + " answers the open checkout; a failed or cancelled one is restarted. The"
                        + " provider's payment.secured webhook moves the trade to PAID. 403 for the"
                        + " seller, 409 INVALID_STATE_TRANSITION otherwise, 404 FEATURE_DISABLED"
                        + " while the flag is off.")
    @ApiResponse(responseCode = "200", description = "The checkout")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION, SELLER_NOT_ONBOARDED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "503",
            description = "SERVICE_UNAVAILABLE (provider unreachable)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public PayResponse pay(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return PayResponse.from(payments.pay(principal.userId(), id));
    }

    @PostMapping("/{id}/ship")
    @Operation(
            operationId = "shipTrade",
            summary = "Confirm the shipment (seller)",
            description =
                    "PAID protected trades → SHIPPED; optional carrier, tracking number and notes"
                        + " for the buyer. The dispute window (payments.dispute_window_days)"
                        + " starts: payment.disputeWindowEndsAt. The buyer gets SHIPMENT_STATUS."
                        + " 403 for the buyer, 409 INVALID_STATE_TRANSITION otherwise.")
    @ApiResponse(responseCode = "200", description = "The trade")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
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
    public TradeResponse ship(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) @Nullable ShipRequest body) {
        return TradeResponse.from(
                payments.ship(
                        principal.userId(),
                        id,
                        body == null ? null : body.carrier(),
                        body == null ? null : body.trackingNumber(),
                        body == null ? null : body.notes()),
                timeProvider.now());
    }

    @PostMapping("/{id}/confirm-receipt")
    @Operation(
            operationId = "confirmTradeReceipt",
            summary = "Confirm the card arrived (buyer)",
            description =
                    "SHIPPED protected trades: RECEIVED, the payout is released to the seller"
                        + " (payment PAID_OUT) and the trade COMPLETED (inventory transfer, both"
                        + " parties may rate each other). 403 for the seller, 409"
                        + " INVALID_STATE_TRANSITION otherwise (a dispute holds the payout).")
    @ApiResponse(responseCode = "200", description = "The completed trade")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
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
    public TradeResponse confirmReceipt(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable UUID id) {
        return TradeResponse.from(
                payments.confirmReceipt(principal.userId(), id), timeProvider.now());
    }

    @PostMapping(path = "/{id}/disputes", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "openTradeDispute",
            summary = "Open a dispute (buyer)",
            description =
                    "PAID or SHIPPED protected trades within the dispute window (409"
                        + " DISPUTE_WINDOW_CLOSED afterwards, extension disputeWindowEndsAt); one"
                        + " dispute per trade. The payout is frozen, the trade becomes DISPUTED and"
                        + " the seller gets DISPUTE_UPDATE. 403 for the seller.")
    @ApiResponse(responseCode = "201", description = "The dispute")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "409",
            description = "INVALID_STATE_TRANSITION, DISPUTE_WINDOW_CLOSED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public ResponseEntity<DisputeResponse> openDispute(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable UUID id,
            @Valid @RequestBody OpenDisputeRequest body) {
        DisputeResponse dispute =
                DisputeResponse.from(
                        disputes.open(principal.userId(), id, body.reason(), body.description()),
                        jsonMapper);
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/disputes/" + dispute.id()))
                .body(dispute);
    }
}
