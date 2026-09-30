package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.payments.domain.DisputeOutcome;
import com.orenjitrade.api.payments.domain.DisputeReason;
import com.orenjitrade.api.payments.domain.EvidenceKind;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import org.jspecify.annotations.Nullable;

/** Request bodies of the payments module (Phase 9). */
public final class PaymentRequests {

    private PaymentRequests() {}

    /** Optional body of {@code POST /me/seller-account/onboarding}. */
    @Schema(name = "SellerOnboardingRequest")
    public record OnboardingRequest(
            @Schema(
                            description =
                                    "Web path the provider returns to (default /settings/payouts)",
                            example = "/settings/payouts",
                            maxLength = 300)
                    @Size(max = 300)
                    @Nullable String returnUrl) {}

    /** Optional body of {@code POST /trades/{id}/ship}. */
    @Schema(name = "ShipTradeRequest")
    public record ShipRequest(
            @Schema(example = "Postal service", maxLength = 80) @Size(max = 80)
                    @Nullable String carrier,
            @Schema(example = "LOCAL-000123", maxLength = 100) @Size(max = 100)
                    @Nullable String trackingNumber,
            @Schema(description = "Shown to the buyer", maxLength = 500) @Size(max = 500)
                    @Nullable String notes) {}

    /** Body of {@code POST /trades/{id}/disputes}. */
    @Schema(name = "OpenDisputeRequest")
    public record OpenDisputeRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull DisputeReason reason,
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 2000)
                    @NotBlank
                    @Size(max = 2000)
                    String description) {}

    /** JSON body of {@code POST /disputes/{id}/evidence} (TEXT and TRACKING evidence). */
    @Schema(name = "DisputeEvidenceRequest")
    public record EvidenceRequest(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "TEXT or TRACKING here; IMAGE and DOCUMENT use the multipart"
                                            + " form; VIDEO is reserved (400)")
                    @NotNull
                    EvidenceKind kind,
            @Schema(description = "Text, or tracking number and carrier", maxLength = 2000)
                    @Size(max = 2000)
                    @Nullable String body,
            @Schema(description = "TRACKING only: https link", maxLength = 500) @Size(max = 500)
                    @Nullable String url) {}

    /** Body of {@code POST /disputes/{id}/messages}. */
    @Schema(name = "DisputeMessageRequest")
    public record MessageRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 2000)
                    @NotBlank
                    @Size(max = 2000)
                    String body) {}

    /** Optional body of {@code POST /payments/fake/{ref}/confirm}. */
    @Schema(name = "FakeCheckoutConfirmRequest")
    public record FakeConfirmRequest(
            @Schema(
                            description = "SUCCEEDED (default) or FAILED",
                            allowableValues = {"SUCCEEDED", "FAILED"})
                    @Nullable String outcome) {}

    /** Optional body of {@code POST /admin/disputes/{id}/freeze}. */
    @Schema(name = "FreezeDisputeRequest")
    public record FreezeRequest(
            @Schema(description = "Kept as an internal note", maxLength = 500) @Size(max = 500)
                    @Nullable String reason) {}

    /** Body of {@code POST /admin/disputes/{id}/notes}. */
    @Schema(name = "DisputeNoteRequest")
    public record NoteRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 2000)
                    @NotBlank
                    @Size(max = 2000)
                    String body) {}

    /** Body of {@code POST /admin/disputes/{id}/resolve}. */
    @Schema(name = "ResolveDisputeRequest")
    public record ResolveRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED) @NotNull DisputeOutcome outcome,
            @Schema(
                            description =
                                    "SPLIT: refunded to the buyer (more than 0, less than the"
                                            + " refundable amount); BUYER: empty or the whole"
                                            + " refundable amount; SELLER: empty or 0",
                            example = "10.00")
                    @DecimalMin("0.00")
                    @Digits(integer = 10, fraction = 2)
                    @Nullable BigDecimal refundAmount,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "Shown to both parties with the decision",
                            maxLength = 1000)
                    @NotBlank
                    @Size(max = 1000)
                    String note) {}

    /** Body of {@code POST /admin/payments/{id}/refund}. */
    @Schema(name = "RefundPaymentRequest")
    public record RefundRequest(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "10.00")
                    @NotNull
                    @DecimalMin("0.01")
                    @Digits(integer = 10, fraction = 2)
                    BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, maxLength = 500)
                    @NotBlank
                    @Size(max = 500)
                    String reason) {}

    /** Body of {@code PUT /admin/payments/settings}: absent fields keep their value. */
    @Schema(name = "UpdatePaymentSettingsRequest")
    public record UpdateSettingsRequest(
            @Schema(minimum = "1", maximum = "60") @Min(1) @Max(60)
                    @Nullable Integer disputeWindowDays,
            @Schema(example = "5.00")
                    @DecimalMin("0.00")
                    @DecimalMax("30.00")
                    @Digits(integer = 2, fraction = 2)
                    @Nullable BigDecimal platformFeePercent,
            @Nullable Boolean autoReleaseEnabled,
            @Schema(minimum = "1", maximum = "168") @Min(1) @Max(168)
                    @Nullable Integer releaseReminderHours,
            @Schema(description = "ADMIN (not only SUPER_ADMIN) may issue refunds")
                    @Nullable Boolean adminRefundsEnabled) {}
}
