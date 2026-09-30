package com.orenjitrade.api.payments.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.orenjitrade.api.payments.domain.AutoReleaseJob;
import com.orenjitrade.api.payments.domain.PaymentRows.PaymentRow;
import com.orenjitrade.api.payments.domain.PaymentStatus;
import com.orenjitrade.api.payments.domain.ProtectedPaymentService.CheckoutView;
import com.orenjitrade.api.payments.domain.ProtectedPaymentService.PayResult;
import com.orenjitrade.api.payments.domain.SellerAccountService.OnboardingView;
import com.orenjitrade.api.payments.domain.SellerAccountService.SellerAccountView;
import com.orenjitrade.api.payments.domain.SellerAccountState;
import com.orenjitrade.api.payments.domain.WebhookService.Receipt;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/**
 * Member-facing response bodies of the payments module (Phase 9). Never card data, never provider
 * account ids; the provider's payment reference only appears in the buyer's own fake checkout.
 */
public final class PaymentResponses {

    private PaymentResponses() {}

    /** {@code GET /me/seller-account}. */
    @Schema(name = "SellerAccount", description = "The caller's payout account")
    public record SellerAccountResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "fake") String provider,
            @Schema(requiredMode = RequiredMode.REQUIRED) SellerAccountState status,
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean payoutsEnabled,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "ACTIVE with payouts enabled: buyers can pay")
                    boolean ready,
            @Schema(nullable = true) @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable Instant updatedAt) {

        static SellerAccountResponse from(SellerAccountView view) {
            return new SellerAccountResponse(
                    view.provider(),
                    view.status(),
                    view.payoutsEnabled(),
                    view.ready(),
                    view.updatedAt());
        }
    }

    /** {@code POST /me/seller-account/onboarding}. */
    @Schema(name = "SellerOnboarding", description = "Where the seller continues the onboarding")
    public record OnboardingResponse(
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description =
                                    "Provider-hosted page, or the return path once the account"
                                            + " is active (fake provider)")
                    String url,
            @Schema(requiredMode = RequiredMode.REQUIRED) SellerAccountResponse account) {

        static OnboardingResponse from(OnboardingView view) {
            return new OnboardingResponse(view.url(), SellerAccountResponse.from(view.account()));
        }
    }

    /** {@code POST /trades/{id}/pay}. */
    @Schema(name = "ProtectedPayment", description = "A started protected checkout")
    public record PayResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID paymentId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID tradeId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "fake") String provider,
            @Schema(requiredMode = RequiredMode.REQUIRED) PaymentStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "40.00") BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "2.00") BigDecimal platformFee,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "38.00")
                    BigDecimal sellerAmount,
            @Schema(
                            nullable = true,
                            description =
                                    "Where the buyer completes the payment (fake provider: the"
                                            + " web path /checkout/fake/<ref>)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String checkoutUrl,
            @Schema(
                            nullable = true,
                            description =
                                    "Client secret for an embedded payment form (Stripe); returned"
                                            + " once, never stored")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable String clientSecret) {

        static PayResponse from(PayResult result) {
            PaymentRow payment = result.payment();
            return new PayResponse(
                    payment.id(),
                    payment.tradeId(),
                    payment.provider(),
                    payment.status(),
                    payment.amount(),
                    payment.currency(),
                    payment.platformFee(),
                    payment.sellerAmount(),
                    payment.checkoutUrl(),
                    result.clientSecret());
        }
    }

    /** {@code GET /payments/fake/{ref}}: what the local checkout page shows. */
    @Schema(name = "FakeCheckout", description = "A fake-provider checkout (local only)")
    public record FakeCheckoutResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) String ref,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID paymentId,
            @Schema(requiredMode = RequiredMode.REQUIRED) UUID tradeId,
            @Schema(requiredMode = RequiredMode.REQUIRED) PaymentStatus status,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "40.00") BigDecimal amount,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "CAD") String currency,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            example = "40.00 CAD for Azure-Eyes Sky Dragon")
                    String summary) {

        static FakeCheckoutResponse from(CheckoutView view) {
            PaymentRow payment = view.payment();
            return new FakeCheckoutResponse(
                    payment.providerRef(),
                    payment.id(),
                    payment.tradeId(),
                    payment.status(),
                    payment.amount(),
                    payment.currency(),
                    view.summary());
        }
    }

    /** Answer of a webhook and of the fake checkout's confirmation. */
    @Schema(name = "PaymentWebhookReceipt", description = "A received provider webhook")
    public record WebhookReceiptResponse(
            @Schema(requiredMode = RequiredMode.REQUIRED) boolean received,
            @Schema(
                            requiredMode = RequiredMode.REQUIRED,
                            description = "The provider already sent this event (no new change)")
                    boolean duplicate,
            @Schema(nullable = true, description = "Stored event (null for a duplicate)")
                    @JsonInclude(JsonInclude.Include.ALWAYS)
                    @Nullable UUID webhookEventId,
            @Schema(requiredMode = RequiredMode.REQUIRED, example = "payment.secured")
                    String type) {

        static WebhookReceiptResponse from(Receipt receipt) {
            return new WebhookReceiptResponse(
                    true, receipt.duplicate(), receipt.webhookEventId(), receipt.type());
        }
    }

    /** {@code POST /internal/jobs/payments-auto-release}. */
    @Schema(name = "PaymentsAutoReleaseJobResult")
    public record AutoReleaseResponse(
            @Schema(description = "payments.auto_release_enabled") boolean enabled,
            @Schema(description = "Buyers reminded") int reminded,
            @Schema(description = "Payouts released") int released,
            @Schema(description = "Releases that failed (retried next run)") int failed) {

        static AutoReleaseResponse from(AutoReleaseJob.Result result) {
            return new AutoReleaseResponse(
                    result.enabled(), result.reminded(), result.released(), result.failed());
        }
    }
}
