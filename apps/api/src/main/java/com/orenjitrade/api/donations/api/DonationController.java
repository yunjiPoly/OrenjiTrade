package com.orenjitrade.api.donations.api;

import com.orenjitrade.api.auth.domain.AuthenticatedUser;
import com.orenjitrade.api.common.ApiException;
import com.orenjitrade.api.common.ProblemFieldError;
import com.orenjitrade.api.donations.api.DonationRequests.CheckoutRequest;
import com.orenjitrade.api.donations.api.DonationRequests.FakeConfirmRequest;
import com.orenjitrade.api.donations.api.DonationResponses.CheckoutResponse;
import com.orenjitrade.api.donations.api.DonationResponses.DonationResponse;
import com.orenjitrade.api.donations.api.DonationResponses.FakeCheckoutResponse;
import com.orenjitrade.api.donations.api.DonationResponses.WebhookReceiptResponse;
import com.orenjitrade.api.donations.domain.DonationRows.DonationRow;
import com.orenjitrade.api.donations.domain.DonationRows.DonationStatus;
import com.orenjitrade.api.donations.domain.DonationService;
import com.orenjitrade.api.donations.domain.DonationService.CheckoutResult;
import com.orenjitrade.api.donations.domain.DonationWebhookService;
import com.orenjitrade.api.donations.infra.FakeDonationProvider;
import com.orenjitrade.api.donations.infra.FakeDonationProvider.SignedWebhook;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.jspecify.annotations.Nullable;
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
 * Member donation routes (Phase 10 contract "Donations"; feature flag {@code donations}: 404
 * FEATURE_DISABLED when off): checkout, the donor's history and the fake provider's checkout (local
 * development and tests). Clearly "voluntary support": donations never affect ratings, ranking or
 * trust.
 */
@RestController
@Tag(name = "donations", description = "Voluntary support (DonationProvider; fake locally)")
public class DonationController {

    static final String PROBLEM_REF = "#/components/schemas/ProblemDetail";

    private final DonationService donations;
    private final DonationWebhookService webhooks;
    private final FakeDonationProvider fake;

    public DonationController(
            DonationService donations, DonationWebhookService webhooks, FakeDonationProvider fake) {
        this.donations = donations;
        this.webhooks = webhooks;
        this.fake = fake;
    }

    @PostMapping(
            path = "/api/v1/donations/checkout",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(
            operationId = "startDonationCheckout",
            summary = "Start a voluntary donation",
            description =
                    "Opens a checkout at the donation provider (fake locally: the web path"
                        + " /checkout/fake-donation/<ref>); the donation is PENDING until the"
                        + " provider's webhook confirms it. publicThanks lists the donor's display"
                        + " name among the supporters (never the amount or the note). Donations"
                        + " never affect ratings, ranking or trust. 400 outside the configured"
                        + " amounts and currencies; 404 FEATURE_DISABLED while donations is off.")
    @ApiResponse(responseCode = "201", description = "The checkout")
    @ApiResponse(
            responseCode = "400",
            description = "VALIDATION_FAILED",
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
    public CheckoutResponse checkout(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @Valid @RequestBody CheckoutRequest body) {
        CheckoutResult result =
                donations.checkout(
                        principal,
                        body.amount(),
                        body.currency(),
                        body.message(),
                        body.publicThanks() != null && body.publicThanks());
        return new CheckoutResponse(DonationResponse.from(result.donation()), result.url());
    }

    @GetMapping(path = "/api/v1/me/donations", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "listMyDonations",
            summary = "The caller's donations",
            description = "Newest first. 404 FEATURE_DISABLED while donations is off.")
    public List<DonationResponse> mine(@AuthenticationPrincipal AuthenticatedUser principal) {
        return donations.mine(principal.userId()).stream().map(DonationResponse::from).toList();
    }

    @GetMapping(path = "/api/v1/donations/fake/{ref}", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            operationId = "getFakeDonationCheckout",
            summary = "A fake-provider donation checkout (donor, local only)",
            description =
                    "What /checkout/fake-donation/<ref> shows. The donor only (404 otherwise).")
    @ApiResponse(responseCode = "200", description = "The checkout")
    @ApiResponse(
            responseCode = "404",
            description = "NOT_FOUND, FEATURE_DISABLED",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public FakeCheckoutResponse fakeCheckout(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String ref) {
        donations.requireEnabled(principal.userId());
        return FakeCheckoutResponse.from(
                donations.checkoutOf(principal.userId(), FakeDonationProvider.ID, ref), ref);
    }

    @PostMapping(
            path = "/api/v1/donations/fake/{ref}/confirm",
            produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            operationId = "confirmFakeDonationCheckout",
            summary = "Pay a fake-provider donation checkout (donor, local only)",
            description =
                    "Emits a signed synthetic donation.succeeded (outcome SUCCEEDED, the default)"
                            + " or donation.failed (FAILED) webhook through the regular donation"
                            + " webhook pipeline; the donation changes asynchronously (poll GET"
                            + " /me/donations). 409 unless PENDING.")
    @ApiResponse(responseCode = "202", description = "The synthetic webhook was received")
    @ApiResponse(
            responseCode = "409",
            description = "CONFLICT (not pending; extension currentStatus)",
            content =
                    @Content(
                            mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE,
                            schema = @Schema(ref = PROBLEM_REF)))
    public WebhookReceiptResponse confirm(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String ref,
            @Valid @RequestBody(required = false) @Nullable FakeConfirmRequest body) {
        donations.requireEnabled(principal.userId());
        DonationRow row = donations.checkoutOf(principal.userId(), FakeDonationProvider.ID, ref);
        if (row.status() != DonationStatus.PENDING) {
            throw ApiException.conflict("This donation is not awaiting payment")
                    .withProperty("currentStatus", row.status().name());
        }
        SignedWebhook webhook =
                outcome(body == null ? null : body.outcome())
                        ? fake.syntheticEvent(
                                FakeDonationProvider.DONATION_SUCCEEDED, Map.of("checkoutRef", ref))
                        : fake.syntheticEvent(
                                FakeDonationProvider.DONATION_FAILED,
                                Map.of("checkoutRef", ref, "failureCode", "card_declined"));
        return WebhookReceiptResponse.from(
                webhooks.receive(
                        FakeDonationProvider.ID,
                        webhook.payload().getBytes(StandardCharsets.UTF_8),
                        webhook.headers()));
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
