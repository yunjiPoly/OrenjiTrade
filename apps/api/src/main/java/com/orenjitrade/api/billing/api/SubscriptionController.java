package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.api.SubscriptionRequests.CancelRequest;
import com.orenjitrade.api.billing.api.SubscriptionRequests.CheckoutRequest;
import com.orenjitrade.api.billing.api.SubscriptionRequests.MobileReceiptRequest;
import com.orenjitrade.api.billing.api.SubscriptionResponses.CheckoutResponse;
import com.orenjitrade.api.billing.api.SubscriptionResponses.MySubscription;
import com.orenjitrade.api.billing.domain.SubscriptionService;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.jspecify.annotations.Nullable;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/v1/me/subscription/**} (Phase 10 contract "Plans and limits"): checkout through the
 * {@code BillingProvider}, cancellation and the reserved mobile-store receipt route. The caller's
 * subscription is also part of {@code GET /me/plan}.
 */
@RestController
@Tag(name = "subscriptions", description = "Premium subscriptions (BillingProvider; fake locally)")
public class SubscriptionController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final SubscriptionService subscriptions;

    public SubscriptionController(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @PostMapping(
            path = "/api/v1/me/subscription/checkout",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "startSubscriptionCheckout",
            summary = "Start a checkout for a paid plan",
            description =
                    "Opens a checkout at the active billing provider and returns where to pay (the"
                        + " fake provider: the web path /checkout/fake-billing/<ref>). The"
                        + " subscription is PENDING until the provider's webhook activates it; the"
                        + " plan and the PREMIUM_USER role follow. An open checkout of the same"
                        + " plan is answered again (resumed=true). 404 FEATURE_DISABLED while"
                        + " premiumPlans is off; 409 ALREADY_SUBSCRIBED while a subscription is"
                        + " active.")
    @ApiResponse(responseCode = "200", description = "The checkout")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED (plan or provider)",
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
    @ApiResponse(
            responseCode = "409",
            description = "ALREADY_SUBSCRIBED (extensions subscriptionId, currentStatus)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    @ApiResponse(
            responseCode = "503",
            description = "SERVICE_UNAVAILABLE (billing provider)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public CheckoutResponse checkout(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CheckoutRequest body) {
        return CheckoutResponse.from(
                subscriptions.checkout(principal, body.planCode(), body.provider()));
    }

    @PostMapping(
            path = "/api/v1/me/subscription/cancel",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "cancelSubscription",
            summary = "Cancel the caller's subscription",
            description =
                    "atPeriodEnd true (default): the plan stays until currentPeriodEnd"
                        + " (cancelAtPeriodEnd=true), then the subscriptions-period job ends it;"
                        + " false: CANCELLED at once and the FREE plan applies. An open checkout is"
                        + " abandoned. Idempotent. 404 without a live subscription.")
    @ApiResponse(responseCode = "200", description = "The subscription")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MySubscription cancel(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestBody(required = false) @Nullable CancelRequest body) {
        boolean atPeriodEnd = body == null || body.atPeriodEnd() == null || body.atPeriodEnd();
        return MySubscription.from(subscriptions.cancel(principal, atPeriodEnd));
    }

    @PostMapping(
            path = "/api/v1/me/subscription/mobile-receipt",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "submitMobileReceipt",
            summary = "Validate an App Store / Google Play receipt (reserved)",
            description =
                    "Reserved for platform billing compliance of the mobile apps; answers 501"
                            + " NOT_IMPLEMENTED until store receipt validation is built.")
    @ApiResponse(
            responseCode = "501",
            description = "NOT_IMPLEMENTED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public MySubscription mobileReceipt(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody(required = false) @Nullable MobileReceiptRequest body) {
        throw new ApiException(
                ErrorCode.NOT_IMPLEMENTED,
                "App Store and Google Play purchases are not supported yet; subscribe on the web");
    }
}
