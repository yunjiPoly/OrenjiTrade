package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.payments.api.PaymentRequests.OnboardingRequest;
import com.orenjitrade.api.payments.api.PaymentResponses.OnboardingResponse;
import com.orenjitrade.api.payments.api.PaymentResponses.SellerAccountResponse;
import com.orenjitrade.api.payments.domain.SellerAccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/me/seller-account} (Phase 9 contract): the caller's payout account and its
 * onboarding at the payment provider (feature flag {@code protectedPayments}).
 */
@RestController
@RequestMapping(path = "/api/v1/me/seller-account", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "payments", description = "Payment protection: payouts, checkout, shipping, receipt")
public class SellerAccountController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final SellerAccountService sellers;

    public SellerAccountController(SellerAccountService sellers) {
        this.sellers = sellers;
    }

    @GetMapping
    @Operation(
            operationId = "getSellerAccount",
            summary = "The caller's payout account",
            description =
                    "NOT_STARTED without an account; ready = ACTIVE with payouts enabled (buyers"
                            + " can pay protected trades). 404 FEATURE_DISABLED while"
                            + " protectedPayments is off for the caller.")
    @ApiResponse(responseCode = "200", description = "The account")
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public SellerAccountResponse get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return SellerAccountResponse.from(sellers.get(principal.userId()));
    }

    @PostMapping("/onboarding")
    @Operation(
            operationId = "startSellerOnboarding",
            summary = "Start or resume the payout onboarding",
            description =
                    "Returns where to continue: the provider-hosted onboarding (Stripe Connect"
                        + " Express) or, with the fake provider, the return path at once (the"
                        + " account is ACTIVE immediately). returnUrl must be a web path (default"
                        + " /settings/payouts). No bank details ever reach OrenjiTrade.")
    @ApiResponse(responseCode = "200", description = "Where to continue")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (returnUrl)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "404",
            description = "FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public OnboardingResponse onboard(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody(required = false) @Nullable OnboardingRequest body) {
        return OnboardingResponse.from(
                sellers.onboard(principal.userId(), body == null ? null : body.returnUrl()));
    }
}
