package com.orenjitrade.api.billing.api;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** Request bodies of the subscription routes (Phase 10). */
public final class SubscriptionRequests {

    private SubscriptionRequests() {}

    /** Body of {@code POST /me/subscription/checkout}. */
    @Schema(name = "SubscriptionCheckoutRequest")
    public record CheckoutRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "PREMIUM", maxLength = 32)
                    @NotBlank
                    @Size(max = 32)
                    String planCode,
            @Schema(
                            description =
                                    "Billing provider; defaults to the active one (fake locally)."
                                            + " apple/google are validated through"
                                            + " /me/subscription/mobile-receipt",
                            example = "fake",
                            maxLength = 32)
                    @Size(max = 32)
                    @Nullable String provider) {}

    /** Optional body of {@code POST /me/subscription/cancel}. */
    @Schema(name = "SubscriptionCancelRequest")
    public record CancelRequest(
            @Schema(
                            description =
                                    "true (default): the plan stays until the end of the paid"
                                            + " period; false: ends now")
                    @Nullable Boolean atPeriodEnd) {}

    /** Body of the reserved {@code POST /me/subscription/mobile-receipt}. */
    @Schema(name = "MobileReceiptRequest")
    public record MobileReceiptRequest(
            @Schema(description = "APPLE or GOOGLE", maxLength = 16) @Size(max = 16)
                    @Nullable String platform,
            @Schema(description = "Store receipt or purchase token", maxLength = 20000)
                    @Size(max = 20000)
                    @Nullable String receipt) {}

    /** Optional body of {@code POST /billing/fake/{ref}/confirm}. */
    @Schema(name = "FakeBillingConfirmRequest")
    public record FakeConfirmRequest(
            @Schema(description = "SUCCEEDED (default) or FAILED", example = "SUCCEEDED")
                    @Size(max = 16)
                    @Nullable String outcome) {}

    /** Body of {@code POST /admin/subscriptions/{id}/cancel}. */
    @Schema(name = "AdminSubscriptionCancelRequest")
    public record AdminCancelRequest(
            @Schema(description = "true: ends now; false (default): at the period end")
                    @Nullable Boolean immediately,
            @Schema(description = "Internal reason (not stored in the audit log)", maxLength = 500)
                    @Size(max = 500)
                    @Nullable String reason) {}
}
