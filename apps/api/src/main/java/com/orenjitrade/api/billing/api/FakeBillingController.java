package com.orenjitrade.api.billing.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.billing.api.SubscriptionRequests.FakeConfirmRequest;
import com.orenjitrade.api.billing.api.SubscriptionResponses.FakeBillingCheckoutResponse;
import com.orenjitrade.api.billing.api.SubscriptionResponses.WebhookReceiptResponse;
import com.orenjitrade.api.billing.domain.BillingWebhookService;
import com.orenjitrade.api.billing.domain.SubscriptionRows.SubscriptionRow;
import com.orenjitrade.api.billing.domain.SubscriptionService;
import com.orenjitrade.api.billing.domain.SubscriptionStatus;
import com.orenjitrade.api.billing.infra.FakeBillingProvider;
import com.orenjitrade.api.billing.infra.FakeBillingProvider.SignedWebhook;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.common.TimeProvider;
import com.orenjitrade.api.featureflags.domain.FeatureFlagKeys;
import com.orenjitrade.api.featureflags.domain.FeatureFlags;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
 * The fake billing provider's checkout (local development and tests only; 404 NOT_FOUND whenever
 * another provider is active): the web page {@code /checkout/fake-billing/<ref>} reads {@code GET
 * /api/v1/billing/fake/{ref}} and the member's click on "Subscribe" calls {@code POST .../confirm},
 * which emits a signed synthetic {@code checkout.completed} (or {@code checkout.failed}) webhook
 * through the regular billing webhook pipeline.
 */
@RestController
@Tag(name = "subscriptions", description = "Premium subscriptions (BillingProvider; fake locally)")
public class FakeBillingController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final ObjectProvider<FakeBillingProvider> fake;
    private final SubscriptionService subscriptions;
    private final BillingWebhookService webhooks;
    private final FeatureFlags featureFlags;
    private final TimeProvider timeProvider;

    public FakeBillingController(
            ObjectProvider<FakeBillingProvider> fake,
            SubscriptionService subscriptions,
            BillingWebhookService webhooks,
            FeatureFlags featureFlags,
            TimeProvider timeProvider) {
        this.fake = fake;
        this.subscriptions = subscriptions;
        this.webhooks = webhooks;
        this.featureFlags = featureFlags;
        this.timeProvider = timeProvider;
    }

    @GetMapping(path = "/api/v1/billing/fake/{ref}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getFakeBillingCheckout",
            summary = "A fake-provider subscription checkout (member, local only)",
            description =
                    "What /checkout/fake-billing/<ref> shows: plan, price and status. The member"
                            + " only; 404 for anybody else and when another provider is active.")
    @ApiResponse(responseCode = "200", description = "The checkout")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public FakeBillingCheckoutResponse checkout(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String ref) {
        requireFake();
        featureFlags.require(FeatureFlagKeys.PREMIUM_PLANS, principal.userId());
        return FakeBillingCheckoutResponse.from(
                subscriptions.checkoutOf(principal.userId(), FakeBillingProvider.ID, ref), ref);
    }

    @PostMapping(
            path = "/api/v1/billing/fake/{ref}/confirm",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "confirmFakeBillingCheckout",
            summary = "Pay a fake-provider subscription checkout (member, local only)",
            description =
                    "Emits a signed synthetic checkout.completed (outcome SUCCEEDED, the default)"
                        + " or checkout.failed (FAILED) webhook through the regular billing webhook"
                        + " pipeline; the subscription becomes ACTIVE asynchronously (poll GET"
                        + " /me/plan). 409 unless the checkout is PENDING; 404 when another"
                        + " provider is active.")
    @ApiResponse(responseCode = "202", description = "The synthetic webhook was received")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT (checkout not pending; extension currentStatus)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WebhookReceiptResponse confirm(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String ref,
            @Valid @RequestBody(required = false) @Nullable FakeConfirmRequest body) {
        FakeBillingProvider provider = requireFake();
        featureFlags.require(FeatureFlagKeys.PREMIUM_PLANS, principal.userId());
        SubscriptionRow row =
                subscriptions.checkoutOf(principal.userId(), FakeBillingProvider.ID, ref);
        if (row.status() != SubscriptionStatus.PENDING) {
            throw ApiException.conflict("This checkout is not awaiting payment")
                    .withProperty("currentStatus", row.status().name());
        }
        boolean succeed = outcome(body == null ? null : body.outcome());
        Instant now = timeProvider.now().truncatedTo(ChronoUnit.SECONDS);
        SignedWebhook webhook =
                succeed
                        ? provider.syntheticEvent(
                                FakeBillingProvider.CHECKOUT_COMPLETED,
                                Map.of(
                                        "checkoutRef", ref,
                                        "subscriptionRef", provider.newSubscriptionRef(),
                                        "periodStart", now.toString(),
                                        "periodEnd", provider.periodEnd(now).toString()))
                        : provider.syntheticEvent(
                                FakeBillingProvider.CHECKOUT_FAILED,
                                Map.of("checkoutRef", ref, "failureCode", "card_declined"));
        return WebhookReceiptResponse.from(
                webhooks.receive(
                        FakeBillingProvider.ID,
                        webhook.payload().getBytes(StandardCharsets.UTF_8),
                        webhook.headers()));
    }

    private FakeBillingProvider requireFake() {
        @Nullable FakeBillingProvider provider = fake.getIfAvailable();
        if (provider == null) {
            throw ApiException.notFound("The fake billing provider is not active");
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
