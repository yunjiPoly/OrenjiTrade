package com.orenjitrade.api.payments.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.payments.api.PaymentRequests.FakeConfirmRequest;
import com.orenjitrade.api.payments.api.PaymentResponses.FakeCheckoutResponse;
import com.orenjitrade.api.payments.api.PaymentResponses.WebhookReceiptResponse;
import com.orenjitrade.api.payments.domain.PaymentFeature;
import com.orenjitrade.api.payments.domain.PaymentStatus;
import com.orenjitrade.api.payments.domain.ProtectedPaymentService;
import com.orenjitrade.api.payments.domain.ProtectedPaymentService.CheckoutView;
import com.orenjitrade.api.payments.domain.WebhookService;
import com.orenjitrade.api.payments.infra.FakePaymentProvider;
import com.orenjitrade.api.payments.infra.FakePaymentProvider.SignedWebhook;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The fake provider's checkout (local development and tests only; 404 NOT_FOUND whenever another
 * provider is active): the web page {@code /checkout/fake/<ref>} reads {@code GET
 * /api/v1/payments/fake/{ref}} and the buyer's click on "Pay" calls {@code POST .../confirm}, which
 * emits a signed synthetic {@code payment.secured} (or {@code payment.failed}) webhook through the
 * regular webhook pipeline. {@code POST /internal/fake-payments/{ref}/succeed|fail} does the same
 * for scripts (service auth).
 */
@RestController
@Tag(name = "payments", description = "Payment protection: payouts, checkout, shipping, receipt")
public class FakePaymentController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ObjectProvider<FakePaymentProvider> fake;
    private final ProtectedPaymentService payments;
    private final WebhookService webhooks;
    private final PaymentFeature feature;

    public FakePaymentController(
            ObjectProvider<FakePaymentProvider> fake,
            ProtectedPaymentService payments,
            WebhookService webhooks,
            PaymentFeature feature) {
        this.fake = fake;
        this.payments = payments;
        this.webhooks = webhooks;
        this.feature = feature;
    }

    @GetMapping(path = "/api/v1/payments/fake/{ref}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getFakeCheckout",
            summary = "A fake-provider checkout (buyer, local only)",
            description =
                    "What /checkout/fake/<ref> shows: amount, currency, terms and status. The"
                            + " buyer only; 404 when another provider is active.")
    @ApiResponse(responseCode = "200", description = "The checkout")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public FakeCheckoutResponse checkout(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String ref) {
        requireFake();
        return FakeCheckoutResponse.from(payments.checkout(principal.userId(), ref));
    }

    @PostMapping(
            path = "/api/v1/payments/fake/{ref}/confirm",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "confirmFakeCheckout",
            summary = "Pay a fake-provider checkout (buyer, local only)",
            description =
                    "Emits a signed synthetic payment.secured (outcome SUCCEEDED, the default) or"
                        + " payment.failed (FAILED) webhook through the regular webhook pipeline;"
                        + " the trade moves to PAID asynchronously (poll GET /trades/{id}). 409"
                        + " unless the checkout is REQUIRES_ACTION; 404 when another provider is"
                        + " active.")
    @ApiResponse(responseCode = "202", description = "The synthetic webhook was received")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT (checkout not awaiting payment)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WebhookReceiptResponse confirm(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String ref,
            @RequestBody(required = false) @Nullable FakeConfirmRequest body) {
        FakePaymentProvider provider = requireFake();
        CheckoutView view = payments.checkout(principal.userId(), ref);
        if (view.payment().status() != PaymentStatus.REQUIRES_ACTION) {
            throw ApiException.conflict("This checkout is not awaiting payment")
                    .withProperty("currentStatus", view.payment().status().name());
        }
        boolean succeed = outcome(body == null ? null : body.outcome());
        return emit(provider, ref, succeed);
    }

    @PostMapping(
            path = "/internal/fake-payments/{ref}/succeed",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "succeedFakePayment",
            summary = "Emit a synthetic payment.secured webhook (service auth, fake provider)",
            description = "404 when another provider is active or protectedPayments is off.")
    public WebhookReceiptResponse succeed(@PathVariable String ref) {
        FakePaymentProvider provider = requireFake();
        feature.requireActive();
        return emit(provider, ref, true);
    }

    @PostMapping(
            path = "/internal/fake-payments/{ref}/fail",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "failFakePayment",
            summary = "Emit a synthetic payment.failed webhook (service auth, fake provider)",
            description = "404 when another provider is active or protectedPayments is off.")
    public WebhookReceiptResponse fail(@PathVariable String ref) {
        FakePaymentProvider provider = requireFake();
        feature.requireActive();
        return emit(provider, ref, false);
    }

    private WebhookReceiptResponse emit(FakePaymentProvider provider, String ref, boolean succeed) {
        SignedWebhook webhook =
                succeed
                        ? provider.syntheticEvent(
                                FakePaymentProvider.PAYMENT_SECURED, Map.of("paymentRef", ref))
                        : provider.syntheticEvent(
                                FakePaymentProvider.PAYMENT_FAILED,
                                Map.of("paymentRef", ref, "failureCode", "card_declined"));
        return WebhookReceiptResponse.from(
                webhooks.receive(
                        FakePaymentProvider.ID,
                        webhook.payload().getBytes(StandardCharsets.UTF_8),
                        webhook.headers()));
    }

    private FakePaymentProvider requireFake() {
        @Nullable FakePaymentProvider provider = fake.getIfAvailable();
        if (provider == null) {
            throw ApiException.notFound("The fake payment provider is not active");
        }
        return provider;
    }

    private static boolean outcome(@Nullable String raw) {
        if (raw == null || raw.isBlank()) {
            return true;
        }
        return switch (raw.trim().toUpperCase(Locale.ROOT)) {
            case "SUCCEEDED" -> true;
            case "FAILED" -> false;
            default ->
                    throw ApiException.validation(
                            "Validation failed",
                            List.of(
                                    new ProblemFieldError(
                                            "outcome", "must be SUCCEEDED or FAILED")));
        };
    }
}
